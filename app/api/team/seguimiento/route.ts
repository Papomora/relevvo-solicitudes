import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function getTeamRol(session: any): string | null {
  return session?.user?.rol ?? null
}

// GET — current week + member's tasks
export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== 'team') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sem = await prisma.seguimientoSemana.findFirst({ orderBy: { semana: 'desc' } })
  if (!sem) return NextResponse.json({ semana: null })

  const rol = getTeamRol(session)
  return NextResponse.json({ semana: sem, rol })
}

// PATCH — update only own rol's tasks/notas
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'team') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rol = getTeamRol(session)
  if (!rol) return NextResponse.json({ error: 'Sin rol asignado' }, { status: 400 })

  const { semanaId, tareas, notas } = await req.json()
  if (!semanaId) return NextResponse.json({ error: 'semanaId requerido' }, { status: 400 })

  const sem = await prisma.seguimientoSemana.findUnique({ where: { id: semanaId } })
  if (!sem) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 })

  const updatedTareas = { ...(sem.tareas as any) }
  const updatedNotas  = { ...(sem.notas as any) }
  if (tareas) updatedTareas[rol] = tareas
  if (notas  !== undefined) updatedNotas[rol] = notas

  const updated = await prisma.seguimientoSemana.update({
    where: { id: semanaId },
    data: { tareas: updatedTareas, notas: updatedNotas },
  })
  return NextResponse.json(updated)
}
