import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { sendWA } from './whatsapp-send'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type HistEntry = { role: 'user' | 'assistant'; content: string }

interface BriefData {
  negocio:     string
  industria:   string
  necesidades: string
  objetivo:    string
  presupuesto: string
  presencia:   string
  notas?:      string
}

interface ProspectoResponse {
  reply:        string
  brief_ready?: boolean
  brief?:       BriefData
}

const SYSTEM_PROMPT = `Eres Relev, asistente de WhatsApp de Relevvo Studio (agencia creativa colombiana).
Un prospecto te escribió después de recibir nuestro mensaje de presentación.

Tu misión: hacer una entrevista breve, cálida y natural para entender su negocio.
Tono: entusiasta pero sin presionar. Máximo 2-3 líneas por mensaje. Siempre en español.

INFORMACIÓN A RECOPILAR (de forma conversacional, no como formulario):
1. Nombre del negocio y a qué se dedica
2. Qué necesita principalmente: contenido redes, diseño, pauta publicitaria, estrategia, o combinación
3. Presencia actual en redes: ninguna / básica / activa pero sin resultados / activa y creciendo
4. Objetivo principal en 3 meses (ventas, reconocimiento, seguidores, lanzamiento de producto)
5. Rango de inversión mensual aproximado:
   - Esencial: $500k–$1.5M COP/mes
   - Estándar: $1.5M–$4M COP/mes
   - Premium: $4M–$8M COP/mes
   - Enterprise: +$8M COP/mes

Cuando tengas respuestas para al menos 4 de los 5 puntos, genera el brief con este JSON EXACTO:
{"reply":"✨ Perfecto [nombre], ya tengo todo lo que necesito. En un momento el equipo de Relevvo te estará contactando con una propuesta personalizada. ¡Gracias por tu tiempo! 🚀","brief_ready":true,"brief":{"negocio":"[nombre negocio]","industria":"[industria]","necesidades":"[qué necesita]","objetivo":"[objetivo principal]","presupuesto":"[rango elegido]","presencia":"[estado actual]","notas":"[cualquier detalle adicional relevante]"}}

Para cualquier otra respuesta usa SOLO texto plano (sin JSON).
Si el prospecto no está interesado, responde amablemente y no insistas.`

export async function handleProspectoMessage(phone: string, text: string): Promise<void> {
  const now = new Date()
  const TIMEOUT_MS = 60 * 60 * 1000 // 1 hour inactivity resets

  // Get or create session
  let session = await prisma.prospectoSession.findUnique({ where: { phone } })

  // If already completed, don't re-engage
  if (session?.estado === 'completado') {
    await sendWA(phone,
      '¡Hola de nuevo! 👋 Ya tenemos tu información. El equipo de Relevvo te contactará pronto. Si tienes alguna duda escríbenos a hola@relevvostudio.com 😊'
    )
    return
  }

  // Reset on timeout
  const timedOut = session && (now.getTime() - session.ultimoMensaje.getTime()) > TIMEOUT_MS
  if (!session) {
    session = await prisma.prospectoSession.create({ data: { phone } })
  } else if (timedOut) {
    await prisma.prospectoSession.update({ where: { phone }, data: { historial: [], estado: 'activo' } })
    session = { ...session, historial: [] as HistEntry[], estado: 'activo' }
  }

  let hist = (session.historial as HistEntry[]).slice(-20)

  // First message — warm welcome
  if (hist.length === 0) {
    const welcome =
      '¡Hola! 👋 Qué bueno que te interesa Relevvo Studio. ' +
      'Me gustaría conocer un poco más tu negocio para ver cómo podemos ayudarte mejor. ' +
      '¿Me cuentas el nombre de tu empresa y a qué se dedica? 😊'
    hist.push({ role: 'assistant', content: welcome })
    await prisma.prospectoSession.update({
      where: { phone },
      data: { historial: hist, ultimoMensaje: now },
    })
    await sendWA(phone, welcome)
    return
  }

  hist.push({ role: 'user', content: text })

  // Track first response time
  if (!session.respondioAt) {
    await prisma.prospectoSession.update({
      where: { phone },
      data:  { respondioAt: now, estado: 'activo' },
    }).catch(() => {})
  }

  // Claude call
  let aiMsg: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    aiMsg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: hist.map(h => ({ role: h.role, content: h.content })),
    })
  } catch (e) {
    console.error('[prospecto] Claude error:', e)
    await sendWA(phone, '⚠️ Tuve un problema técnico. Intenta de nuevo en un momento.')
    return
  }

  const rawText = (aiMsg.content[0] as any).text ?? ''
  let parsed: ProspectoResponse = { reply: rawText }

  // Try to extract JSON
  try {
    const m = extractFirstJson(rawText)
    if (m) parsed = m as ProspectoResponse
  } catch { /* keep raw */ }

  const reply = parsed.reply || rawText
  hist.push({ role: 'assistant', content: reply })

  // If brief is ready → save + notify admin
  if (parsed.brief_ready && parsed.brief) {
    await prisma.prospectoSession.update({
      where: { phone },
      data: {
        historial:    hist.slice(-30),
        estado:       'completado',
        brief:        JSON.stringify(parsed.brief),
        nombre:       parsed.brief.negocio || undefined,
        completadoAt: now,
        ultimoMensaje: now,
      },
    })
    await sendWA(phone, reply)
    await notifyAdminBrief(phone, parsed.brief)
    return
  }

  // Continue conversation
  await prisma.prospectoSession.update({
    where: { phone },
    data: { historial: hist.slice(-30), ultimoMensaje: now },
  })
  await sendWA(phone, reply)
}

// ── Notify admin with formatted brief ─────────────────────────
async function notifyAdminBrief(prospectoPhone: string, brief: BriefData): Promise<void> {
  const adminPhone = process.env.ADMIN_WA_PHONE ?? '+573223094005'
  const msg =
    `🎯 *NUEVO PROSPECTO CALIFICADO*\n\n` +
    `📱 Número: ${prospectoPhone}\n` +
    `🏢 Negocio: ${brief.negocio}\n` +
    `🏷️ Industria: ${brief.industria}\n\n` +
    `📋 *NECESIDADES:*\n${brief.necesidades}\n\n` +
    `🎯 *OBJETIVO (3 meses):*\n${brief.objetivo}\n\n` +
    `📊 Presencia actual: ${brief.presencia}\n` +
    `💰 Presupuesto: ${brief.presupuesto}\n` +
    (brief.notas ? `\n📝 Notas: ${brief.notas}\n` : '') +
    `\n🔗 Listo para propuesta — escríbele directamente a ${prospectoPhone}`

  await sendWA(adminPhone, msg).catch(() => {})
}

// ── JSON extractor ─────────────────────────────────────────────
function extractFirstJson(text: string): object | null {
  let i = text.indexOf('{')
  if (i === -1) return null
  let depth = 0
  for (let j = i; j < text.length; j++) {
    if (text[j] === '{') depth++
    else if (text[j] === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(i, j + 1)) } catch { return null } } }
  }
  return null
}
