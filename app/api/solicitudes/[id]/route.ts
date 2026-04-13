import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const { estado, nota, perfil, asignado } = body

  const updated = await prisma.solicitud.update({
    where: { id },
    data:  {
      estado,
      nota,
      ...(perfil    !== undefined && { perfil }),
      ...(asignado  !== undefined && { asignado }),
      updatedAt: new Date(),
    },
  })

  return NextResponse.json(updated)
}
