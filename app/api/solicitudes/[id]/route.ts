import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyClienteEstado, notifyIntegrante } from '@/lib/team-notify'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  const role    = (session?.user as any)?.role

  if (role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const id   = parseInt(params.id)
  const body = await req.json()
  const { estado, nota, perfil, asignado, archivado, createdAt } = body

  // Snapshot previous state for notification comparison
  const prev = (estado !== undefined || asignado !== undefined)
    ? await prisma.solicitud.findUnique({ where: { id }, select: { estado: true, cliente: true, tipo: true, urgencia: true, descripcion: true, asignado: true } })
    : null

  const updated = await prisma.solicitud.update({
    where: { id },
    data:  {
      estado,
      nota,
      ...(perfil     !== undefined && { perfil }),
      ...(asignado   !== undefined && { asignado }),
      ...(archivado  !== undefined && { archivado }),
      ...(createdAt  !== undefined && { createdAt: new Date(createdAt) }),
      updatedAt: new Date(),
    },
  })

  // Notify client via WA when status changes
  if (prev && estado && prev.estado !== estado) {
    prisma.clienteWA.findFirst({ where: { nombre: prev.cliente, activo: true } })
      .then(cwa => {
        if (cwa) notifyClienteEstado(cwa.phone, id, prev.tipo ?? '', estado)
      })
      .catch(() => {})
  }

  // Notify integrante via WA when they are newly assigned
  if (prev && asignado && prev.asignado !== asignado) {
    prisma.integrante.findFirst({ where: { nombre: asignado } })
      .then(integrante => {
        if (integrante?.phone && prev) {
          notifyIntegrante(integrante, {
            id,
            cliente: prev.cliente ?? '',
            tipo:    prev.tipo ?? '',
            urgencia: prev.urgencia ?? '',
            descripcion: prev.descripcion ?? '',
          })
        }
      })
      .catch(() => {})
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  const role    = (session?.user as any)?.role

  if (role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const id = parseInt(params.id)
  await prisma.solicitud.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
