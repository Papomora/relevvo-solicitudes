import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// ── Sanitize phone: strip spaces, ensure + prefix ─────────────
function cleanPhone(raw: string): string {
  return raw.replace(/\s/g, '').replace(/^(?!\+)/, '+')
}

// ── Direct Meta API call with real error reporting ─────────────
async function sendMetaMessage(to: string, text: string): Promise<{ ok: boolean; status?: number; error?: string; msgId?: string }> {
  const token   = process.env.META_WA_TOKEN
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !phoneId) return { ok: false, error: 'META_WA_TOKEN o META_WA_PHONE_NUMBER_ID no configurados' }

  const phone = cleanPhone(to)

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   phone,
        type: 'text',
        text: { body: text },
      }),
    })
    const data = await res.json() as any
    if (!res.ok) {
      const errMsg = data?.error?.message ?? JSON.stringify(data)
      return { ok: false, status: res.status, error: errMsg }
    }
    return { ok: true, msgId: data?.messages?.[0]?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

/**
 * POST /api/admin/equipo/broadcast
 * Sends a WhatsApp message to all team members with a registered phone.
 *
 * Auth: admin session OR Authorization: Bearer <CRON_SECRET>
 * Body: { mensaje: string }
 *
 * NOTE: Meta only delivers free-form text if the recipient messaged the bot
 * within the last 24 hours. For first-time outbound, use sendWATemplate instead.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') ?? ''
  const session    = await auth()
  const isAdmin    = (session?.user as any)?.role === 'admin'
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isAdmin && !isCron)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mensaje } = await req.json()
  if (!mensaje?.trim())
    return NextResponse.json({ error: 'mensaje es requerido' }, { status: 400 })

  const integrantes = await prisma.integrante.findMany({
    where: { phone: { not: null } },
    orderBy: { nombre: 'asc' },
  })

  const resultados: {
    nombre: string
    phone: string
    phoneLimpio: string
    ok: boolean
    msgId?: string
    error?: string
    metaStatus?: number
  }[] = []

  for (const m of integrantes) {
    if (!m.phone) continue
    const phoneLimpio = cleanPhone(m.phone)
    const result = await sendMetaMessage(phoneLimpio, mensaje)
    resultados.push({
      nombre:      m.nombre,
      phone:       m.phone,
      phoneLimpio,
      ...result,
    })
  }

  return NextResponse.json({
    enviados: resultados.filter(r => r.ok).length,
    fallidos: resultados.filter(r => !r.ok).length,
    total:    resultados.length,
    detalle:  resultados,
  })
}
