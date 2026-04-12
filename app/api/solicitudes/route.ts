import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// ── WhatsApp via CallMeBot ─────────────────────────────────────
// Env: WHATSAPP_PHONE_1 / WHATSAPP_APIKEY_1  (up to 3 recipients)
async function sendWhatsAppAlerts(s: { cliente: string; tipo: string; urgencia: string }) {
  const urgLabel = s.urgencia === 'alta' ? '🔴 Alta' : s.urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const text = encodeURIComponent(
    `🔔 *Nueva solicitud — Relevvo Portal*\n\n👤 Cliente: ${s.cliente}\n📋 Tipo: ${s.tipo}\n⚡ Prioridad: ${urgLabel}\n\nRevisa el panel de admin para más detalles.`
  )
  for (let i = 1; i <= 3; i++) {
    const phone  = process.env[`WHATSAPP_PHONE_${i}`]
    const apikey = process.env[`WHATSAPP_APIKEY_${i}`]
    if (!phone || !apikey) continue
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${text}&apikey=${apikey}`)
  }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role    = (session.user as any)?.role
  const cliente = session.user?.name

  const where = role === 'admin' ? {} : { cliente: cliente ?? '' }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(solicitudes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role === 'admin') return NextResponse.json({ error: 'Admin no puede enviar solicitudes' }, { status: 403 })

  const body = await req.json()
  const { tipo, urgencia, descripcion, adjuntos } = body
  const cliente = session.user?.name ?? ''

  if (!tipo || !urgencia || !descripcion)
    return NextResponse.json({ error: 'Campos requeridos' }, { status: 400 })

  const nueva = await prisma.solicitud.create({
    data: { cliente, tipo, urgencia, descripcion, adjuntos: adjuntos ?? [] },
  })

  // WhatsApp alerts (fire-and-forget)
  sendWhatsAppAlerts(nueva).catch(() => {})

  return NextResponse.json(nueva, { status: 201 })
}
