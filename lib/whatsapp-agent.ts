import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { sendWA } from './whatsapp-send'
import { notifyTeam, notifyClienteEstado } from './team-notify'
import { ASIGNACION, CLIENTES } from './constants'
import { uploadMediaToDrive } from './google-drive'
import { handleProspectoMessage } from './prospecto-agent'

type MediaInfo = { url: string; mimeType: string; ext: string }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TIMEOUT_MS = 30 * 60 * 1000 // 30 min

type HistEntry = { role: 'user' | 'assistant'; content: string }

interface AgentCreate  { type: 'create';  tipo: string; urgencia: string; descripcion: string }
interface AgentUpdate  { type: 'update';  id: number;   campo: string;    valor: string }
interface AgentNotify  { type: 'notify_client'; mensaje: string }
interface AgentNone    { type: 'none' }
type AgentAction = AgentCreate | AgentUpdate | AgentNotify | AgentNone

interface AgentResponse { reply: string; action?: AgentAction }

// ── Entry point ────────────────────────────────────────────────
export async function handleIncomingMessage(
  phone: string, text: string, media?: MediaInfo
): Promise<void> {
  // 1. Verify registered client — route unregistered to prospecto agent
  const cwa = await prisma.clienteWA.findUnique({ where: { phone } })
  if (!cwa || !cwa.activo) {
    await handleProspectoMessage(phone, text)
    return
  }

  // Multi-account: nombre contains "|" (e.g. "Crusso|Molicie") or is "Admin"
  const cuentas: string[] = cwa.nombre === 'Admin'
    ? CLIENTES
    : cwa.nombre.includes('|') ? cwa.nombre.split('|').map(s => s.trim()).filter(Boolean)
    : []
  const isMultiCuenta = cuentas.length > 0
  const now = new Date()

  // 2. Get/create session — reset history on timeout
  let session = await prisma.waSession.findUnique({ where: { phone } })
  const timedOut = session && (now.getTime() - session.ultimoMensaje.getTime()) > TIMEOUT_MS

  if (!session) {
    session = await prisma.waSession.create({
      data: { phone, cliente: isMultiCuenta ? '' : cwa.nombre, historial: [] },
    })
  } else if (timedOut) {
    await prisma.waSession.update({
      where: { phone },
      data: { historial: [], ...(isMultiCuenta && { cliente: '' }) },
    })
    session = { ...session, historial: [] as HistEntry[], ...(isMultiCuenta && { cliente: '' }) }
  }

  // 3. Multi-account: account selection flow
  if (isMultiCuenta) {
    const lowerText = text.toLowerCase().trim()
    const switchCmd = lowerText.startsWith('cambiar') || lowerText.startsWith('cuenta:')
    if (!session.cliente || switchCmd) {
      // Try to match one of the allowed accounts from the message
      const matched = cuentas.find(c => lowerText.includes(c.toLowerCase()))
      if (matched) {
        await prisma.waSession.update({ where: { phone }, data: { cliente: matched, historial: [], ultimoMensaje: now } })
        await sendWA(phone, `✅ Listo — gestionando *${matched}*.\n¿Qué necesitas?`)
        return
      }
      // No match — show their accounts
      const lista = cuentas.map((c, i) => `${i + 1}. ${c}`).join('\n')
      await prisma.waSession.update({ where: { phone }, data: { ultimoMensaje: now } })
      const saludo = cwa.nombre === 'Admin' ? 'Admin' : 'hola'
      await sendWA(phone, `👋 ¡${saludo}! ¿Para cuál cuenta es esta solicitud?\n\n${lista}\n\nResponde el nombre de la cuenta.`)
      return
    }
  }

  // Active client
  const clienteActivo = isMultiCuenta ? session.cliente : cwa.nombre

  let hist = (session.historial as HistEntry[]).slice(-18)
  hist.push({ role: 'user', content: media ? `${text || ''}[adjunto recibido]` : text })

  // 4. Context: active solicitudes + monthly usage
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
  const [activas, mesCount] = await Promise.all([
    prisma.solicitud.findMany({
      where: { cliente: clienteActivo, archivado: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, tipo: true, urgencia: true, estado: true, descripcion: true, createdAt: true },
    }),
    prisma.solicitud.count({ where: { cliente: clienteActivo, createdAt: { gte: inicioMes } } }),
  ])
  const restantes = cwa.limiteMes - mesCount

  // 5. Claude call
  let aiMsg: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    aiMsg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: buildSystem(clienteActivo, activas, restantes, cwa.limiteMes, isMultiCuenta),
      messages: hist.map(h => ({ role: h.role, content: h.content })),
    })
  } catch (e) {
    console.error('[agent] Claude API error:', e)
    await sendWA(phone, '⚠️ Error temporal del asistente. Intenta de nuevo en un momento.')
    return
  }

  const rawText = (aiMsg.content[0] as any).text ?? ''

  // Extract ALL valid JSON objects from the response (Claude may return multiple)
  const allParsed: AgentResponse[] = extractAllJson(rawText)
  const parsed: AgentResponse = allParsed[0] ?? { reply: rawText }

  // 6. Execute all actions; use the first non-empty reply
  let finalReply = parsed.reply || allParsed.map(p => p.reply).find(r => r) || rawText
  for (const p of allParsed) {
    if (p.action?.type === 'create') {
      finalReply = await doCreate(p.action, clienteActivo, restantes, cwa.limiteMes)
    } else if (p.action?.type === 'update') {
      await doUpdate(p.action, clienteActivo, p.reply)
    } else if (p.action?.type === 'notify_client') {
      finalReply = await doNotifyClient(p.action, clienteActivo)
    }
  }
  // If multiple updates happened, use the reply from the first parsed block
  if (allParsed.length > 1 && allParsed[0].reply) finalReply = allParsed[0].reply

  // 7. Save incoming media to most recent solicitud (upload to Google Drive if configured)
  if (media && activas.length > 0) {
    const s = activas[0]
    const full = await prisma.solicitud.findUnique({ where: { id: s.id }, select: { adjuntos: true } })
    if (full) {
      const adj = Array.isArray(full.adjuntos) ? (full.adjuntos as string[]) : []

      // Try Drive upload; fall back to raw CDN URL
      const savedUrl = await uploadMediaToDrive(media.url, media.mimeType, media.ext, clienteActivo, s.id)
        .catch(() => null) ?? media.url

      await prisma.solicitud.update({ where: { id: s.id }, data: { adjuntos: [...adj, savedUrl] } }).catch(() => {})

      // Notify team
      const teamMsg = encodeURIComponent(`📎 ${clienteActivo} envió un archivo para #REL-${s.id}\n🔗 solicitudes.relevvostudio.com/admin`)
      for (let i = 1; i <= 3; i++) {
        const p = process.env[`WHATSAPP_PHONE_${i}`]
        const k = process.env[`WHATSAPP_APIKEY_${i}`]
        if (p && k) fetch(`https://api.callmebot.com/whatsapp.php?phone=${p}&text=${teamMsg}&apikey=${k}`).catch(() => {})
      }
    }
  }

  // 7. Update session + reply
  hist.push({ role: 'assistant', content: finalReply })
  await prisma.waSession.update({
    where: { phone },
    data: { historial: hist.slice(-20), ultimoMensaje: now },
  })
  await sendWA(phone, finalReply)
}

// ── JSON extractor (handles multiple objects in one response) ──
function extractAllJson(text: string): AgentResponse[] {
  const results: AgentResponse[] = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('{', i)
    if (start === -1) break
    let depth = 0
    let j = start
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') { depth--; if (depth === 0) break }
    }
    try {
      const obj = JSON.parse(text.slice(start, j + 1))
      if (obj && typeof obj.reply === 'string') results.push(obj as AgentResponse)
    } catch { /* skip */ }
    i = j + 1
  }
  return results
}

// ── Actions ───────────────────────────────────────────────────
async function doCreate(
  a: AgentCreate, cliente: string, restantes: number, limiteMes: number
): Promise<string> {
  if (restantes <= 0) {
    return (
      `Este mes ya alcanzaste tu límite de solicitudes (${limiteMes}/${limiteMes}).\n` +
      `Para continuar escríbenos a hola@relevvostudio.com 💪`
    )
  }
  const nueva = await prisma.solicitud.create({
    data: { cliente, tipo: a.tipo, urgencia: a.urgencia, descripcion: a.descripcion, adjuntos: [] },
  })
  const urg  = a.urgencia === 'alta' ? '🔴 Alta' : a.urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const asig = ASIGNACION[a.tipo] ?? 'Equipo'
  notifyTeam({ id: nueva.id, cliente, tipo: a.tipo, urgencia: a.urgencia, descripcion: a.descripcion, asignado: asig }).catch(() => {})

  const usadas = limiteMes - restantes + 1
  let reply = `✅ Solicitud #REL-${nueva.id} creada — ${urg}\n📋 ${a.tipo} · 👉 ${asig}\nTe avisamos cuando esté lista 🚀`
  if (usadas >= Math.floor(limiteMes * 0.8)) {
    const quedan = restantes - 1
    reply += quedan <= 0
      ? `\n\n⚠️ Ya alcanzaste tu límite mensual (${limiteMes}/${limiteMes}).`
      : `\n\n📊 Este mes: ${usadas}/${limiteMes} solicitudes. Te quedan ${quedan}.`
  }
  return reply
}

async function doUpdate(a: AgentUpdate, cliente: string, defaultReply: string): Promise<string> {
  const s = await prisma.solicitud.findFirst({ where: { id: a.id, cliente } })
  if (!s) return 'No encontré esa solicitud. ¿Puedes confirmar el número? 🙏'
  const CAMPOS_PERMITIDOS = ['urgencia', 'descripcion', 'estado', 'nota']
  if (!CAMPOS_PERMITIDOS.includes(a.campo)) return defaultReply
  await prisma.solicitud.update({ where: { id: a.id }, data: { [a.campo]: a.valor } }).catch(() => {})
  if (a.campo === 'estado') {
    prisma.clienteWA.findFirst({ where: { nombre: s.cliente, activo: true } })
      .then(cwa => { if (cwa) notifyClienteEstado(cwa.phone, s.id, s.tipo, a.valor) })
      .catch(() => {})
  }
  return defaultReply
}

async function doNotifyClient(a: AgentNotify, cliente: string): Promise<string> {
  const cwaCliente = await prisma.clienteWA.findFirst({ where: { nombre: cliente, activo: true } })
  if (!cwaCliente) return `❌ No encontré el número de WhatsApp de ${cliente}.`
  await sendWA(cwaCliente.phone, a.mensaje)
  return `✅ Mensaje enviado a ${cliente} 📲`
}

// ── System prompt ─────────────────────────────────────────────
function buildSystem(cliente: string, activas: any[], restantes: number, limiteMes: number, isAdmin = false): string {
  const solCtx = activas.length
    ? activas.map(s => `  #REL-${s.id}: ${s.tipo} · ${s.urgencia} · ${s.estado} · "${s.descripcion?.slice(0, 60)}"`).join('\n')
    : '  (ninguna activa)'

  return `Eres Relev, el asistente de WhatsApp de Relevvo Studio (agencia creativa). Hablas con ${cliente}.
Tono: cálido, profesional, conciso. Siempre en español. Máximo 3-4 líneas por mensaje.

SOLICITUDES ACTIVAS DE ${cliente.toUpperCase()}:
${solCtx}

PLAN DEL MES: ${limiteMes - restantes} usadas de ${limiteMes}. Quedan: ${restantes}.
TIPOS DISPONIBLES: Contenido nuevo · Pauta / ads · Diseño · Reunión / llamada · Revisión / corrección
URGENCIAS: alta · media · baja

══ REGLAS DE ACCIÓN ══
1. Para CREAR solicitud — cuando tengas tipo, urgencia y descripción completa, responde SOLO con JSON:
{"reply":"Texto amigable confirmando la solicitud...","action":{"type":"create","tipo":"Diseño","urgencia":"alta","descripcion":"descripción completa aquí"}}

2. Para ACTUALIZAR urgencia o descripción — responde SOLO con JSON:
{"reply":"✅ Listo — #REL-47 ahora es prioridad 🟡 Media.","action":{"type":"update","id":47,"campo":"urgencia","valor":"media"}}

3. Para consultas de estado, preguntas o cuando aún falte información — responde en texto PLANO (sin JSON).

4. Si el cliente envía adjunto — responde: "📎 Adjunto recibido y guardado en tu solicitud más reciente."

5. NUNCA menciones precios, contratos ni información interna del equipo.${isAdmin ? `

══ MODO ADMIN ══
Estás hablando con el equipo interno de Relevvo. Están gestionando al cliente ${cliente}.
El admin puede escribir "cambiar cuenta" para cambiar de cliente.

ACTUALIZAR ESTADO — cuando el equipo termina o avanza una tarea, usa este JSON:
{"reply":"✅ #REL-47 marcada como completada. El cliente recibirá aviso.","action":{"type":"update","id":47,"campo":"estado","valor":"completado"}}

ESTADOS VÁLIDOS: pendiente | en_proceso | revision | completado | cancelado

También puedes actualizar urgencia, descripcion o nota — misma estructura JSON.
Al actualizar estado, el cliente recibe automáticamente un WhatsApp de notificación.

ENVIAR MENSAJE AL CLIENTE — cuando el admin quiera avisarle algo a ${cliente}, usa este JSON:
{"reply":"✅ Mensaje enviado a ${cliente} 📲","action":{"type":"notify_client","mensaje":"Hola ${cliente} 👋 Tu solicitud #REL-33 ya está siendo procesada. Te avisamos cuando esté lista 🚀"}}

IMPORTANTE: Cuando el admin diga "indicale", "avisale", "dile", "envialo", "si envialo" — usa notify_client para enviar el mensaje DIRECTAMENTE al cliente. NO respondas el mensaje de vuelta al admin sin enviarlo.` : ''}`
}
