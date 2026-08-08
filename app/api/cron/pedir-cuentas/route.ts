/**
 * /api/cron/pedir-cuentas
 *
 * Sends a WhatsApp billing request to all team members asking
 * them to submit their "cuenta de cobro" PDF for the current month.
 *
 * Trigger options:
 *   1. Manually: POST /api/cron/pedir-cuentas  (with Authorization header)
 *   2. Vercel cron: add to vercel.json  →  "0 9 28-31 * *" (last days of month at 9am)
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { notifyBillingRequest } from '@/lib/team-notify'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Verify secret
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization') ?? ''

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await notifyBillingRequest()
    const mes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date())
    return NextResponse.json({
      ok:  true,
      msg: `Billing request enviado para ${mes}`,
      ts:  new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[pedir-cuentas] error:', e)
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

// Also support GET for Vercel cron (Vercel calls GET for cron jobs)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization') ?? ''

  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await notifyBillingRequest()
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
