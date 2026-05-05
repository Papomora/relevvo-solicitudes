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

  const ahora     = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const clientes  = await prisma.clienteWA.findMany({ where: { activo: true } })

  let avisos = 0
  for (const cwa of clientes) {
    const usadas = await prisma.solicitud.count({
      where: { cliente: cwa.nombre, createdAt: { gte: inicioMes } },
    })
    const pct = usadas / cwa.limiteMes

    if (pct >= 1) {
      // 100% — already blocked at creation time; just send reminder if needed
      await sendWA(cwa.phone,
        `Hola ${cwa.nombre} 📊 Este mes ya alcanzaste tu límite de ${cwa.limiteMes} solicitudes.\n` +
        `Para continuar escríbenos a hola@relevvostudio.com 💪`
      ).catch(() => {})
      avisos++
    } else if (pct >= 0.8) {
      const quedan = cwa.limiteMes - usadas
      await sendWA(cwa.phone,
        `Hola ${cwa.nombre} 📊 Este mes llevan ${usadas} de ${cwa.limiteMes} solicitudes.\n` +
        `Les quedan ${quedan}. ¿Necesitan ampliar el plan?`
      ).catch(() => {})
      avisos++
    }
  }

  return NextResponse.json({ avisos, total: clientes.length })
}
