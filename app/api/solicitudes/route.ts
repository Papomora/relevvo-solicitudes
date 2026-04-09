import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

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

  const body = await req.json()
  const { tipo, urgencia, descripcion } = body
  const cliente = session.user?.name ?? ''

  if (!tipo || !urgencia || !descripcion)
    return NextResponse.json({ error: 'Campos requeridos' }, { status: 400 })

  const nueva = await prisma.solicitud.create({
    data: { cliente, tipo, urgencia, descripcion },
  })

  return NextResponse.json(nueva, { status: 201 })
}
