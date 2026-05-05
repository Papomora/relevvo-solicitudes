import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
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

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only weekdays — schedule fires M-F but double-check
  const col = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  if (col.getDay() === 0 || col.getDay() === 6)
    return NextResponse.json({ skipped: 'fin de semana' })

  const ahora   = new Date()
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000)

  const clientes = await prisma.clienteWA.findMany({ where: { activo: true } })
  let enviados = 0

  for (const cwa of clientes) {
    // Skip if client wrote OR was checked-in in the last 48h
    const session = await prisma.waSession.findUnique({ where: { phone: cwa.phone } })
    if (session && session.ultimoMensaje > hace48h) continue
    if (cwa.ultimoCheckIn && cwa.ultimoCheckIn > hace48h) continue

    // Count active solicitudes
    const activas = await prisma.solicitud.count({
      where: { cliente: cwa.nombre, archivado: false, estado: { in: ['pendiente', 'en_proceso'] } },
    })

    const msg = activas > 0
      ? `Buenos días ${cwa.nombre} 👋\nTienen ${activas} solicitud${activas > 1 ? 'es' : ''} en proceso esta semana.\n¿Algo más que necesiten? Estoy aquí 😊`
      : `Buenos días ${cwa.nombre} 👋\n¿Tienen alguna solicitud para esta semana?\nEscríbanme aquí y lo gestiono de inmediato 🚀`

    await sendWA(cwa.phone, msg).catch(() => {})

    await prisma.clienteWA.update({
      where: { id: cwa.id },
      data:  { ultimoCheckIn: ahora },
    })
    enviados++
  }

  return NextResponse.json({ enviados })
}
