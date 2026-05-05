import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { sendWA } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function normalizeCliente(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: ü → u, á → a
    .replace(/\s+/g, '_')
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Previous month
  const ahora  = new Date()
  const prevD  = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const mes    = MESES[prevD.getMonth()]
  const año    = prevD.getFullYear()
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://solicitudes.relevvostudio.com'

  const clientes = await prisma.clienteWA.findMany({ where: { activo: true } })
  let enviados = 0

  for (const cwa of clientes) {
    const slug     = normalizeCliente(cwa.nombre)
    const filename = `${slug}_${mes}${año}.html`
    const filepath = join(process.cwd(), 'public', 'reportes', filename)

    if (!existsSync(filepath)) continue

    await sendWA(cwa.phone,
      `Hola ${cwa.nombre} 📊 Tu informe de ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año} ya está listo:\n` +
      `👉 ${baseUrl}/reportes/${filename}\n\n` +
      `¿Tienes alguna pregunta sobre los resultados? Escríbeme aquí 😊`
    ).catch(() => {})
    enviados++
  }

  return NextResponse.json({ enviados, mes, año })
}
