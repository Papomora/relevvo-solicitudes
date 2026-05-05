import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const clientes = await prisma.clienteWA.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(clientes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { phone, nombre, limiteMes } = await req.json()
  if (!phone || !nombre)
    return NextResponse.json({ error: 'phone y nombre son requeridos' }, { status: 400 })

  // Normalize phone: ensure starts with +
  const phoneNorm = phone.startsWith('+') ? phone : `+${phone}`

  const cliente = await prisma.clienteWA.upsert({
    where:  { phone: phoneNorm },
    update: { nombre, limiteMes: limiteMes ?? 10, activo: true },
    create: { phone: phoneNorm, nombre, limiteMes: limiteMes ?? 10 },
  })
  return NextResponse.json(cliente, { status: 201 })
}
