import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CLIENTES } from '@/lib/constants'

export const runtime = 'nodejs'

// PATCH — update PIN for a client (upsert in DB)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { cliente: string } }
) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cliente = decodeURIComponent(params.cliente)
  if (!CLIENTES.includes(cliente))
    return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })

  const { pin } = await req.json()
  if (!pin || !/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'PIN debe ser 4 dígitos' }, { status: 400 })

  await prisma.clientePin.upsert({
    where:  { cliente },
    update: { pin },
    create: { cliente, pin },
  })

  return NextResponse.json({ ok: true })
}
