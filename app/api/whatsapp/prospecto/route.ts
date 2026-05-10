import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWATemplate } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const prospectos = await prisma.prospectoSession.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, phone: true, nombre: true, estado: true,
      entregado: true, leido: true,
      enviadoAt: true, respondioAt: true, completadoAt: true,
      followUp1At: true, followUp2At: true, ultimoMensaje: true,
      historial: true, brief: true, createdAt: true,
    },
  })
  return NextResponse.json(prospectos)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { phone, nombre } = await req.json()
  if (!phone?.trim())
    return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })

  const clean      = phone.trim().replace(/\s+/g, '')
  const normalized = clean.startsWith('+') ? clean : `+${clean}`
  const nombreClean = nombre?.trim() || 'amig@'

  const templateName = process.env.META_WA_TEMPLATE_PROSPECTO ?? 'relevvo_prospecto'
  const msgId = await sendWATemplate(normalized, templateName, [nombreClean])

  const now = new Date()

  // Upsert ProspectoSession — reset if previously existed
  await prisma.prospectoSession.upsert({
    where:  { phone: normalized },
    create: {
      phone:      normalized,
      nombre:     nombreClean !== 'amig@' ? nombreClean : null,
      messageId:  msgId,
      enviadoAt:  now,
      historial:  [],
    },
    update: {
      nombre:      nombreClean !== 'amig@' ? nombreClean : undefined,
      messageId:   msgId,
      enviadoAt:   now,
      estado:      'activo',
      entregado:   false,
      leido:       false,
      respondioAt: null,
      completadoAt:null,
      followUp1At: null,
      followUp2At: null,
      historial:   [],
      brief:       null,
    },
  })

  return NextResponse.json({ ok: true, phone: normalized, messageId: msgId })
}
