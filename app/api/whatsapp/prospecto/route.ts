import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendWATemplate } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { phone, nombre } = await req.json()
  if (!phone?.trim())
    return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })

  // Normalize: strip spaces, ensure + prefix
  const clean = phone.trim().replace(/\s+/g, '')
  const normalized = clean.startsWith('+') ? clean : `+${clean}`

  const templateName = process.env.META_WA_TEMPLATE_PROSPECTO ?? 'relevvo_prospecto'
  await sendWATemplate(normalized, templateName, [nombre?.trim() || 'amig@'])

  return NextResponse.json({ ok: true, phone: normalized })
}
