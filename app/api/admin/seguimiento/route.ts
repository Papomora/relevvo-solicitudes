import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// ── Default task structure (all false) ────────────────────────
function defaultTareas() {
  return {
    editora:  { diario: [false,false,false], semanal: [false,false], quincenal: [false], mensual: [false,false] },
    cm:       { diario: [false,false,false], semanal: [false,false], quincenal: [false], mensual: [false,false,false,false] },
    director: { diario: [false,false,false], semanal: [false,false,false], quincenal: [false,false], mensual: [false,false,false] },
    miguel:   { diario: [false,false], semanal: [false,false,false], quincenal: [false,false], mensual: [false,false,false] },
  }
}

function defaultNotas() {
  return { editora: '', cm: '', director: '', miguel: '' }
}

function defaultTablero() {
  const base = (prefix: string) => [
    { id:`${prefix}1`, t:'Parrilla semanal entregada', asignado:'cm', estado:'pendiente', notas:'' },
    { id:`${prefix}2`, t:'Publicaciones semana publicadas', asignado:'cm', estado:'pendiente', notas:'' },
    { id:`${prefix}3`, t:'Campañas activas revisadas', asignado:'miguel', estado:'pendiente', notas:'' },
    { id:`${prefix}4`, t:'Reporte de avance al director', asignado:'director', estado:'pendiente', notas:'' },
  ]
  return {
    'ARü':                 base('ar'),
    'Coondor':             base('co'),
    'Crusso':              [
      { id:'cr1', t:'12 posts + historias mensuales', asignado:'cm', estado:'pendiente', notas:'' },
      { id:'cr2', t:'Parrilla semanal entregada', asignado:'cm', estado:'pendiente', notas:'' },
      { id:'cr3', t:'Campañas activas (Meta/Google)', asignado:'miguel', estado:'pendiente', notas:'' },
      { id:'cr4', t:'Reporte mensual al director', asignado:'director', estado:'pendiente', notas:'' },
    ],
    'Fresitas la Playita': base('fr'),
    'Groi':                [
      { id:'gr1', t:'10 publicaciones (4 cuentas integradas)', asignado:'cm', estado:'pendiente', notas:'' },
      { id:'gr2', t:'Parrilla semanal 4 cuentas', asignado:'cm', estado:'pendiente', notas:'' },
      { id:'gr3', t:'Campañas activas Groi', asignado:'miguel', estado:'pendiente', notas:'' },
      { id:'gr4', t:'Reporte mensual al director', asignado:'director', estado:'pendiente', notas:'' },
    ],
    'Molicie':             [
      { id:'mo1', t:'3 videos diarios (×15 semana / 60 mes)', asignado:'editora', estado:'pendiente', notas:'' },
      { id:'mo2', t:'12 posts + historias mensuales', asignado:'cm', estado:'pendiente', notas:'' },
      { id:'mo3', t:'Campañas activas (Meta/Google)', asignado:'miguel', estado:'pendiente', notas:'' },
      { id:'mo4', t:'Reporte mensual al director', asignado:'director', estado:'pendiente', notas:'' },
    ],
    'Versla':              base('vs'),
    'Visuality':           base('vi'),
  }
}

// ── GET: all semanas ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const semanas = await prisma.seguimientoSemana.findMany({
    orderBy: { semana: 'desc' },
    take: 30,
  })
  return NextResponse.json(semanas)
}

// ── POST: create new semana ────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { semana, inicio, fin } = await req.json()
  if (!semana || !inicio || !fin)
    return NextResponse.json({ error: 'semana, inicio y fin son requeridos' }, { status: 400 })

  // Check duplicate
  const existing = await prisma.seguimientoSemana.findUnique({ where: { semana: Number(semana) } })
  if (existing)
    return NextResponse.json({ error: `La semana #${semana} ya existe` }, { status: 409 })

  const nueva = await prisma.seguimientoSemana.create({
    data: {
      semana:  Number(semana),
      inicio,
      fin,
      tareas:   defaultTareas(),
      notas:    defaultNotas(),
      tablero:  defaultTablero(),
    },
  })
  return NextResponse.json(nueva, { status: 201 })
}
