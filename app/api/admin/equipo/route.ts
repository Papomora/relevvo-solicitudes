import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const integrantes = await prisma.integrante.findMany({ orderBy: { nombre: 'asc' } })
  return NextResponse.json(integrantes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nombre } = await req.json()
  if (!nombre?.trim())
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const integrante = await prisma.integrante.create({ data: { nombre: nombre.trim() } })
  return NextResponse.json(integrante, { status: 201 })
}
