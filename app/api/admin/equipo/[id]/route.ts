import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = parseInt(params.id)
  const { nombre } = await req.json()
  if (!nombre?.trim())
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const updated = await prisma.integrante.update({ where: { id }, data: { nombre: nombre.trim() } })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = parseInt(params.id)
  await prisma.integrante.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
