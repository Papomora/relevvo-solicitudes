import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWA } from '@/lib/whatsapp-send'
import { buildMsgInicioSemana, RolKey } from '@/lib/seguimiento-config'

export const runtime = 'nodejs'

/**
 * POST /api/admin/seguimiento/[id]/notify
 * Envía mensaje de inicio de semana a cada integrante según su rol
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = parseInt(params.id)
  const sem = await prisma.seguimientoSemana.findUnique({ where: { id } })
  if (!sem) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 })

  // Get all integrantes with phone and rol
  const integrantes = await prisma.integrante.findMany({
    where: { phone: { not: null }, rol: { not: null } },
  })

  const resultados: { nombre: string; ok: boolean }[] = []

  for (const integ of integrantes) {
    if (!integ.phone || !integ.rol) continue
    const rol = integ.rol as RolKey
    const msg = buildMsgInicioSemana(integ.nombre, rol, sem.semana, sem.inicio, sem.fin)
    try {
      await sendWA(integ.phone, msg)
      resultados.push({ nombre: integ.nombre, ok: true })
    } catch {
      resultados.push({ nombre: integ.nombre, ok: false })
    }
  }

  return NextResponse.json({
    enviados: resultados.filter(r => r.ok).length,
    total:    resultados.length,
    detalle:  resultados,
  })
}
