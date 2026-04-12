import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CLIENTES, TIPOS, URGENCIAS } from '@/lib/constants'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as any)?.role

  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cliente, tipo, urgencia, descripcion } = await req.json()

  if (!CLIENTES.includes(cliente))
    return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  if (!TIPOS.includes(tipo))
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if (!URGENCIAS.find(u => u.value === urgencia))
    return NextResponse.json({ error: 'Urgencia inválida' }, { status: 400 })
  if (!descripcion?.trim())
    return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 })

  const nueva = await prisma.solicitud.create({
    data: { cliente, tipo, urgencia, descripcion: descripcion.trim(), adjuntos: [] },
  })

  // WhatsApp alert (fire-and-forget)
  const urgLabel = urgencia === 'alta' ? '🔴 Alta' : urgencia === 'media' ? '🟡 Media' : '🟢 Baja'
  const text = encodeURIComponent(`🔔 *Solicitud creada por admin — Relevvo Portal*\n\n👤 Cliente: ${cliente}\n📋 Tipo: ${tipo}\n⚡ Prioridad: ${urgLabel}`)
  for (let i = 1; i <= 3; i++) {
    const phone  = process.env[`WHATSAPP_PHONE_${i}`]
    const apikey = process.env[`WHATSAPP_APIKEY_${i}`]
    if (phone && apikey) fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${text}&apikey=${apikey}`).catch(()=>{})
  }

  return NextResponse.json(nueva, { status: 201 })
}
