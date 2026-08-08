import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWA } from '@/lib/whatsapp-send'

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

  const { nombre, phone, password } = await req.json()
  if (!nombre?.trim())
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  // Auto-generate password if not provided: first4chars + "2026"
  const autoPass = password?.trim() || (nombre.trim().slice(0,4).charAt(0).toUpperCase() + nombre.trim().slice(1,4).toLowerCase() + '2026')

  const integrante = await prisma.integrante.create({
    data: { nombre: nombre.trim(), phone: phone?.trim() || null, password: autoPass },
  })

  // Welcome message via WA
  if (integrante.phone) {
    const msg =
      `Hola ${integrante.nombre} 👋 Bienvenid@ al equipo de *Relevvo Studio*.\n\n` +
      `Desde ahora recibirás notificaciones aquí cuando se te asigne una tarea.\n\n` +
      `🔗 Panel: solicitudes.relevvostudio.com/admin`
    sendWA(integrante.phone, msg).catch(() => {})
  }

  return NextResponse.json(integrante, { status: 201 })
}
