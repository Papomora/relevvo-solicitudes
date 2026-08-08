import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CLIENTES, CLIENT_PIN_MAP } from '@/lib/constants'

export const runtime = 'nodejs'

// GET — list all clients (real + demo) with their PINs
export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const dbPins = await prisma.clientePin.findMany()
  const dbMap: Record<string, { pin: string; presupuesto: number | null }> = {}
  dbPins.forEach(r => { dbMap[r.cliente] = { pin: r.pin, presupuesto: r.presupuesto ?? null } })

  // Real clients (hardcoded list)
  const result = CLIENTES.map(cliente => {
    const envKey  = CLIENT_PIN_MAP[cliente]
    const fromDB  = dbMap[cliente]
    const fromEnv = process.env[envKey] ?? ''
    return {
      cliente,
      pin:         fromDB?.pin ?? fromEnv,
      source:      fromDB ? 'db' : 'env',
      presupuesto: fromDB?.presupuesto ?? null,
      demo:        false,
    }
  })

  // Demo clients — ClientePin entries whose name is NOT in CLIENTES
  const demoEntries = dbPins.filter(r => !CLIENTES.includes(r.cliente))
  for (const d of demoEntries) {
    result.push({
      cliente:     d.cliente,
      pin:         d.pin,
      source:      'db',
      presupuesto: d.presupuesto ?? null,
      demo:        true,
    })
  }

  return NextResponse.json(result)
}

// POST — create a demo client (name must not conflict with real clients)
export async function POST(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cliente, pin } = await req.json()

  if (!cliente?.trim())
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  if (!/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'PIN debe ser 4 dígitos' }, { status: 400 })

  if (CLIENTES.includes(cliente.trim()))
    return NextResponse.json({ error: 'Ese nombre ya existe como cliente real' }, { status: 409 })

  await prisma.clientePin.upsert({
    where:  { cliente: cliente.trim() },
    create: { cliente: cliente.trim(), pin },
    update: { pin },
  })

  return NextResponse.json({ ok: true })
}
