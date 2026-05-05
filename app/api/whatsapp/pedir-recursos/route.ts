import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWA } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

const RECURSO_LABELS: Record<string, string> = {
  fotos:    '📸 Fotografías del producto/evento',
  brief:    '📝 Brief o información de la campaña',
  videos:   '🎥 Videos o clips para editar',
  textos:   '📄 Textos, datos o copys',
  branding: '🎨 Logos y archivos de marca actualizados',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { solicitudId, recursos, mensaje } = await req.json()
  if (!solicitudId || (!recursos?.length && !mensaje))
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const solicitud = await prisma.solicitud.findUnique({ where: { id: Number(solicitudId) } })
  if (!solicitud) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  const cwa = await prisma.clienteWA.findFirst({
    where: { nombre: solicitud.cliente, activo: true },
  })
  if (!cwa) return NextResponse.json({ error: 'El cliente no tiene WhatsApp registrado' }, { status: 404 })

  const lineas = (recursos as string[] ?? [])
    .map(r => RECURSO_LABELS[r] ?? r)
    .join('\n')

  const waText =
    `Hola ${solicitud.cliente} 👋\n` +
    `Para avanzar con tu solicitud #REL-${solicitud.id} (${solicitud.tipo}), necesitamos:\n\n` +
    `${lineas}${mensaje ? `\n${mensaje}` : ''}\n\n` +
    `¿Puedes enviárnoslos hoy o mañana?\nEl equipo de Relevvo está listo para continuar 🚀`

  await sendWA(cwa.phone, waText)
  return NextResponse.json({ ok: true })
}
