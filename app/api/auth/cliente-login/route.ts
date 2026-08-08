import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_PIN_MAP, CLIENTES } from '@/lib/constants'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 10
const WINDOW_MS    = 5 * 60 * 1000  // 5 minutes

async function checkRateLimit(ip: string): Promise<boolean> {
  const key     = `pin:${ip}`
  const now     = new Date()
  const resetAt = new Date(now.getTime() + WINDOW_MS)

  const record = await prisma.rateLimit.upsert({
    where:  { key },
    update: {
      count:   { increment: 1 },
      resetAt: { set: now > (await prisma.rateLimit.findUnique({ where: { key } }))?.resetAt! ? resetAt : undefined },
    },
    create: { key, count: 1, resetAt },
  }).catch(() => null)

  if (!record) return true  // DB error — allow through
  if (now > record.resetAt) {
    // Window expired — reset
    await prisma.rateLimit.update({ where: { key }, data: { count: 1, resetAt } }).catch(() => {})
    return true
  }
  return record.count <= MAX_ATTEMPTS
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  const allowed = await checkRateLimit(ip)
  if (!allowed)
    return NextResponse.json({ error: 'Demasiados intentos. Espera 5 minutos.' }, { status: 429 })

  const { cliente, pin } = await req.json()
  if (!cliente || !pin)
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const clienteName = (cliente as string).trim()

  // --- Real client: check env var PIN first, then DB override ---
  const envKey = CLIENT_PIN_MAP[clienteName]
  if (envKey) {
    // Check DB override first (set via admin panel)
    const dbEntry = await prisma.clientePin.findUnique({ where: { cliente: clienteName } })
    const pinCorrecto = dbEntry?.pin ?? process.env[envKey] ?? ''
    if (!pinCorrecto || pin !== pinCorrecto)
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    return NextResponse.json({ ok: true, cliente: clienteName })
  }

  // --- Demo client: not in hardcoded list, must exist in ClientePin DB ---
  if (!CLIENTES.includes(clienteName)) {
    const dbEntry = await prisma.clientePin.findUnique({ where: { cliente: clienteName } })
    if (!dbEntry)
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    if (pin !== dbEntry.pin)
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    return NextResponse.json({ ok: true, cliente: clienteName })
  }

  return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
}
