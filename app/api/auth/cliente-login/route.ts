import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_PIN_MAP } from '@/lib/constants'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { cliente, pin } = await req.json()

  const envKey = CLIENT_PIN_MAP[cliente as string]
  if (!envKey)
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const pinCorrecto = process.env[envKey]
  if (!pinCorrecto || pin !== pinCorrecto)
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })

  return NextResponse.json({ ok: true, cliente })
}
