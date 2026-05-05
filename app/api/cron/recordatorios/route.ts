import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { notifyRecordatorio } from '@/lib/team-notify'
import { sendWA } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function isHorarioLaboral(): boolean {
  const col  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const hora = col.getHours()
  const dia  = col.getDay() // 0=Dom, 6=Sab
  return hora >= 8 && hora < 18 && dia >= 1 && dia <= 5
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isHorarioLaboral()) return NextResponse.json({ skipped: 'fuera de horario' })

  const ahora    = new Date()
  const hace24h  = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
  const hace48h  = new Date(ahora.getTime() - 48 * 60 * 60 * 1000)
  const hace72h  = new Date(ahora.getTime() - 72 * 60 * 60 * 1000)
  const antiSpam = new Date(ahora.getTime() - 12 * 60 * 60 * 1000)

  // Solicitudes pendientes sin recordatorio reciente
  const stalled = await prisma.solicitud.findMany({
    where: {
      estado:    'pendiente',
      archivado: false,
      createdAt: { lte: hace24h },
      OR: [
        { ultimoRecordatorio: null },
        { ultimoRecordatorio: { lte: antiSpam } },
      ],
    },
  })

  let enviados = 0
  for (const s of stalled) {
    const horas = Math.floor((ahora.getTime() - s.createdAt.getTime()) / (60 * 60 * 1000))

    // Notify team
    await notifyRecordatorio({
      id:       s.id,
      cliente:  s.cliente,
      tipo:     s.tipo,
      urgencia: s.urgencia,
      asignado: s.asignado ?? undefined,
      horas,
    }).catch(() => {})

    // At 72h — also notify client
    if (s.createdAt <= hace72h) {
      const cwa = await prisma.clienteWA.findFirst({
        where: { nombre: s.cliente, activo: true },
      })
      if (cwa) {
        sendWA(cwa.phone,
          `Hola ${s.cliente} 👋 Tu solicitud #REL-${s.id} (${s.tipo}) está siendo procesada.\n` +
          `Habrá una pequeña demora — nuestro equipo la tomará muy pronto 🙏`
        ).catch(() => {})
      }
    }

    await prisma.solicitud.update({
      where: { id: s.id },
      data:  { ultimoRecordatorio: ahora },
    })
    enviados++
  }

  return NextResponse.json({ enviados, total: stalled.length })
}
