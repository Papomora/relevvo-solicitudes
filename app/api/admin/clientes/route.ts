import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CLIENTES, CLIENT_PIN_MAP } from '@/lib/constants'

export const runtime = 'nodejs'

// GET — list all clients with their current PINs (DB first, fallback to env)
export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const dbPins = await prisma.clientePin.findMany()
  const dbMap: Record<string, string> = {}
  dbPins.forEach(r => { dbMap[r.cliente] = r.pin })

  const result = CLIENTES.map(cliente => {
    const envKey = CLIENT_PIN_MAP[cliente]
    const fromDB  = dbMap[cliente]
    const fromEnv = process.env[envKey] ?? ''
    return {
      cliente,
      pin:    fromDB ?? fromEnv,
      source: fromDB ? 'db' : 'env',
    }
  })

  return NextResponse.json(result)
}
