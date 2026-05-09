import { sendWA } from './whatsapp-send'
import { ASIGNACION } from './constants'

// Notify a specific team member when they are assigned to a task
export async function notifyIntegrante(
  integrante: { nombre: string; phone?: string | null },
  sol: { id: number; cliente: string; tipo: string; urgencia: string; descripcion: string }
): Promise<void> {
  if (!integrante.phone) return
  const urg = sol.urgencia === 'alta' ? '🔴 Alta' : sol.urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const desc = sol.descripcion.slice(0, 100) + (sol.descripcion.length > 100 ? '...' : '')
  const msg =
    `👋 Hola ${integrante.nombre}!\n\n` +
    `📋 Te asignaron una tarea:\n\n` +
    `🆔 #REL-${sol.id} · ${sol.tipo} · ${urg}\n` +
    `👤 Cliente: ${sol.cliente}\n` +
    `📝 "${desc}"\n\n` +
    `🔗 solicitudes.relevvostudio.com/admin`
  await sendWA(integrante.phone, msg).catch(() => {})
}

// Phones that receive team alerts — comma-separated in TEAM_ALERT_PHONES env var
// e.g. "573223094005,573001234567"
function getTeamPhones(): string[] {
  const raw = process.env.TEAM_ALERT_PHONES ?? ''
  return raw.split(',').map(p => p.trim()).filter(Boolean).map(p => p.startsWith('+') ? p : `+${p}`)
}

// Notify each team member via Meta WA (same channel as the agent)
export async function notifyTeam(s: {
  id: number; cliente: string; tipo: string
  urgencia: string; descripcion: string; asignado?: string
}): Promise<void> {
  const urg  = s.urgencia === 'alta' ? '🔴 Alta' : s.urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const asig = s.asignado ?? ASIGNACION[s.tipo] ?? 'Equipo'
  const msg  =
    `🔔 Nueva solicitud #REL-${s.id}\n` +
    `👤 Cliente: ${s.cliente}\n` +
    `📋 Tipo: ${s.tipo} · ⚡ ${urg}\n` +
    `📝 "${s.descripcion.slice(0, 80)}${s.descripcion.length > 80 ? '...' : ''}"\n` +
    `👉 Para: ${asig}\n` +
    `🔗 solicitudes.relevvostudio.com/admin`

  const phones = getTeamPhones()
  for (const phone of phones) {
    sendWA(phone, msg).catch(() => {})
  }

  // Fallback: CallMeBot if configured
  for (let i = 1; i <= 3; i++) {
    const phone  = process.env[`WHATSAPP_PHONE_${i}`]
    const apikey = process.env[`WHATSAPP_APIKEY_${i}`]
    if (!phone || !apikey) continue
    const encoded = encodeURIComponent(msg)
    fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apikey}`).catch(() => {})
  }
}

// Notify client via WA when admin changes status
export async function notifyClienteEstado(
  phone: string, id: number, tipo: string, estado: string
): Promise<void> {
  const label: Record<string, string> = {
    en_proceso: '🔄 En proceso',
    revision:   '👀 En revisión',
    completado: '✅ Completada',
    cancelado:  '❌ Cancelada',
  }
  const estadoLabel = label[estado] ?? estado
  await sendWA(phone,
    `Hola 👋 Tu solicitud #REL-${id} (${tipo}) ahora está ${estadoLabel}.\n` +
    `¿Tienes alguna duda? Escríbeme aquí 😊`
  )
}

// Reminder to team for stalled tasks
export async function notifyRecordatorio(s: {
  id: number; cliente: string; tipo: string; urgencia: string; asignado?: string; horas: number
}): Promise<void> {
  const urg   = s.urgencia === 'alta' ? '🔴 Alta' : s.urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const nivel = s.horas >= 72 ? '🚨 Urgente (72h)' : s.horas >= 48 ? '⚠️ Crítico (48h)' : '⚠️ Sin iniciar (24h)'
  const msg   =
    `${nivel}\n#REL-${s.id} · ${s.tipo} · ${urg}\nCliente: ${s.cliente}\n` +
    `${s.asignado ? `👉 ${s.asignado} — ¿ya tomaste esta tarea?\n` : ''}` +
    `🔗 solicitudes.relevvostudio.com/admin`

  const phones = getTeamPhones()
  for (const phone of phones) {
    sendWA(phone, msg).catch(() => {})
  }

  // Fallback: CallMeBot if configured
  for (let i = 1; i <= 3; i++) {
    const phone  = process.env[`WHATSAPP_PHONE_${i}`]
    const apikey = process.env[`WHATSAPP_APIKEY_${i}`]
    if (!phone || !apikey) continue
    fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(msg)}&apikey=${apikey}`).catch(() => {})
  }
}
