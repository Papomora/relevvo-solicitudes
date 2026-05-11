import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWATemplate } from '@/lib/whatsapp-send'
import { sendWA } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const now   = new Date()
  const h2    = new Date(now.getTime() - 2  * 60 * 60 * 1000)
  const h12   = new Date(now.getTime() - 12 * 60 * 60 * 1000)
  let sent = 0

  // ── Follow-up 1: 2h after sending, no response yet ────────────
  const noReply2h = await prisma.prospectoSession.findMany({
    where: {
      estado:      'activo',
      respondioAt: null,
      enviadoAt:   { lte: h2 },
      followUp1At: null,
    },
  })

  for (const p of noReply2h) {
    const templateName = process.env.META_WA_TEMPLATE_PROSPECTO ?? 'relevvo_prospecto'
    const nombre = p.nombre ?? 'amig@'
    await sendWATemplate(p.phone, templateName, [nombre])
    await prisma.prospectoSession.update({
      where: { phone: p.phone },
      data:  { followUp1At: now },
    })
    sent++
  }

  // ── Follow-up 2: 12h after sending, still no response ─────────
  const noReply12h = await prisma.prospectoSession.findMany({
    where: {
      estado:      'activo',
      respondioAt: null,
      enviadoAt:   { lte: h12 },
      followUp2At: null,
    },
  })

  for (const p of noReply12h) {
    const templateName = process.env.META_WA_TEMPLATE_PROSPECTO ?? 'relevvo_prospecto'
    const nombre = p.nombre ?? 'amig@'
    await sendWATemplate(p.phone, templateName, [nombre])
    await prisma.prospectoSession.update({
      where: { phone: p.phone },
      data:  { followUp2At: now },
    })
    sent++
  }

  // ── Nudge: responded but didn't finish in 2h ──────────────────
  const stalled2h = await prisma.prospectoSession.findMany({
    where: {
      estado:       'activo',
      respondioAt:  { not: null, lte: h2 },
      completadoAt: null,
      followUp1At:  null,
      ultimoMensaje:{ lte: h2 },
    },
  })

  for (const p of stalled2h) {
    const msg =
      `Hola${p.nombre ? ` ${p.nombre}` : ''} 👋 ¿Seguimos con la charla? ` +
      `Solo me faltan un par de datos para preparar tu propuesta personalizada 😊`
    await sendWA(p.phone, msg).catch(() => {})
    await prisma.prospectoSession.update({
      where: { phone: p.phone },
      data:  { followUp1At: now },
    })
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
