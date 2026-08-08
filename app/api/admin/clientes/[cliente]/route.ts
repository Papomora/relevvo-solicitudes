import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CLIENTES } from '@/lib/constants'

export const runtime = 'nodejs'

// PATCH — update PIN / presupuesto for any client (real or demo)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { cliente: string } }
) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cliente = decodeURIComponent(params.cliente)

  // Must be a real client OR an existing demo (ClientePin entry)
  const isReal  = CLIENTES.includes(cliente)
  const existing = await prisma.clientePin.findUnique({ where: { cliente } })
  if (!isReal && !existing)
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const body = await req.json()
  const { pin, presupuesto, nuevoNombre } = body

  if (pin !== undefined && !/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'PIN debe ser 4 dígitos' }, { status: 400 })

  // Rename — only demo clients (not in hardcoded list)
  if (nuevoNombre !== undefined) {
    if (isReal)
      return NextResponse.json({ error: 'No se puede renombrar un cliente real' }, { status: 403 })
    const nuevo = (nuevoNombre as string).trim()
    if (!nuevo) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    if (CLIENTES.includes(nuevo))
      return NextResponse.json({ error: 'Ese nombre ya existe como cliente real' }, { status: 409 })
    // Update ClientePin + all Solicitudes referencing old name
    await prisma.$transaction([
      prisma.clientePin.update({ where: { cliente }, data: { cliente: nuevo, ...(pin && { pin }), ...(presupuesto !== undefined && { presupuesto: presupuesto === null ? null : Number(presupuesto) }) } }),
      prisma.solicitud.updateMany({ where: { cliente }, data: { cliente: nuevo } }),
    ])
    return NextResponse.json({ ok: true, nuevoNombre: nuevo })
  }

  const currentPin = existing?.pin ?? '0000'

  await prisma.clientePin.upsert({
    where:  { cliente },
    update: {
      ...(pin         !== undefined && { pin }),
      ...(presupuesto !== undefined && { presupuesto: presupuesto === null ? null : Number(presupuesto) }),
    },
    create: { cliente, pin: pin ?? currentPin, presupuesto: presupuesto ? Number(presupuesto) : null },
  })

  return NextResponse.json({ ok: true })
}

// DELETE — remove a demo client (not allowed for real hardcoded clients)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { cliente: string } }
) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cliente = decodeURIComponent(params.cliente)

  if (CLIENTES.includes(cliente))
    return NextResponse.json({ error: 'No se puede eliminar un cliente real' }, { status: 403 })

  await prisma.clientePin.deleteMany({ where: { cliente } })

  return NextResponse.json({ ok: true })
}
