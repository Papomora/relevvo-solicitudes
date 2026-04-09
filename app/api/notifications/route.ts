import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Polling endpoint — returns solicitudes since a given timestamp
// Client polls every 15s with ?since=<ISO timestamp>
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const since   = req.nextUrl.searchParams.get('since')
  const role    = (session.user as any)?.role
  const cliente = session.user?.name

  const where: any = since
    ? { createdAt: { gt: new Date(since) } }
    : {}

  if (role !== 'admin') where.cliente = cliente ?? ''

  const nuevas = await prisma.solicitud.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ nuevas, count: nuevas.length })
}
