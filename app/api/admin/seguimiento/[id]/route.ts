import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// ── PATCH: update tareas and/or notas ─────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const data: any = {}
  if (body.tareas !== undefined) data.tareas = body.tareas
  if (body.notas  !== undefined) data.notas  = body.notas

  const updated = await prisma.seguimientoSemana.update({
    where: { id },
    data,
  })
  return NextResponse.json(updated)
}
