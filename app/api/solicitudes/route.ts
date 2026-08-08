import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyTeam } from '@/lib/team-notify'
import { ASIGNACION } from '@/lib/constants'

export const runtime = 'nodejs'

function isInternalRequest(req: NextRequest): string | null {
  const secret  = process.env.INTERNAL_SECRET
  const header  = req.headers.get('x-internal-secret')
  if (!secret || !header || header.trim() !== secret.trim()) return null
  return req.headers.get('x-internal-cliente') // returns client name or null
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
  // Allow internal calls (from WhatsApp agent) bypassing session auth
  const internalCliente = isInternalRequest(req)

  let cliente: string
  if (internalCliente) {
    cliente = internalCliente
  } else {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const role = (session.user as any)?.role
    if (role === 'admin') return NextResponse.json({ error: 'Admin no puede enviar solicitudes' }, { status: 403 })
    cliente = session.user?.name ?? ''
  }

  const body = await req.json()
  const { tipo, urgencia, descripcion, adjuntos } = body

  if (!tipo || !urgencia || !descripcion)
    return NextResponse.json({ error: 'Campos requeridos' }, { status: 400 })

  const nueva = await prisma.solicitud.create({
    data: { cliente, tipo, urgencia, descripcion, adjuntos: adjuntos ?? [] },
  })

  // Await team notification before responding — fire-and-forget was being killed by serverless
  const asig = ASIGNACION[tipo] ?? 'Equipo'
  await notifyTeam({ id: nueva.id, cliente, tipo, urgencia, descripcion, asignado: asig }).catch(() => {})

  return NextResponse.json(nueva, { status: 201 })
}
