import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// CORS headers — permite peticiones desde relevvostudio.com
const CORS = {
  'Access-Control-Allow-Origin':  'https://www.relevvostudio.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// OPTIONS — preflight CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// POST — guarda lead en la base de datos
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nombre, email, telefono, empresa, fuente } = body

    if (!nombre?.trim() || !email?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'nombre y email son requeridos' },
        { status: 400, headers: CORS }
      )
    }

    const lead = await prisma.leadMarca90.create({
      data: {
        nombre:   nombre.trim(),
        email:    email.trim(),
        telefono: telefono?.trim() || '',
        empresa:  empresa?.trim() || '',
        mensaje:  fuente?.trim()  || '',
      },
    })

    console.log(`[Marca90] Nuevo lead: ${nombre} | ${email} | ${empresa}`)

    return NextResponse.json({ ok: true, id: lead.id }, { headers: CORS })
  } catch (err: any) {
    console.error('[Marca90] Error:', err)
    return NextResponse.json(
      { ok: false, error: 'Error interno' },
      { status: 500, headers: CORS }
    )
  }
}

// GET — lista leads (solo admin)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const leads = await prisma.leadMarca90.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(leads)
}
