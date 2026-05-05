import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { handleIncomingMessage } from '@/lib/whatsapp-agent'

export const runtime = 'nodejs'

// ── GET: Meta webhook verification ────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST: Incoming messages ────────────────────────────────────
export async function POST(req: NextRequest) {
  const bodyText = await req.text()

  // Verify X-Hub-Signature-256 (only if APP_SECRET is configured)
  const appSecret = process.env.META_WA_APP_SECRET
  if (appSecret) {
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    const expected  = 'sha256=' + createHmac('sha256', appSecret).update(bodyText).digest('hex')
    const sigBuf    = Buffer.from(signature.padEnd(expected.length, '\0'))
    const expBuf    = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let body: any
  try { body = JSON.parse(bodyText) } catch { return NextResponse.json({ ok: true }) }

  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
  if (!messages?.length) return NextResponse.json({ ok: true }) // status updates, ignore

  const msg  = messages[0]
  const from = msg.from as string // e.g. "573001234567"
  const phone = from.startsWith('+') ? from : `+${from}`

  let text     = ''
  let mediaUrl: string | undefined

  switch (msg.type) {
    case 'text':
      text = msg.text?.body ?? ''
      break
    case 'image':
    case 'document':
    case 'video':
      mediaUrl = await fetchMediaUrl(msg[msg.type]?.id)
      text = msg.caption ?? ''
      break
    case 'audio':
      text = '[Mensaje de voz — no puedo procesar audio]'
      break
    default:
      return NextResponse.json({ ok: true })
  }

  // Await handler — fire-and-forget caused silent failures in serverless
  try {
    await handleIncomingMessage(phone, text, mediaUrl)
  } catch (e) {
    console.error('[webhook] handleIncomingMessage failed:', e)
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ───────────────────────────────────────────────────
async function fetchMediaUrl(mediaId?: string): Promise<string | undefined> {
  if (!mediaId) return undefined
  const token = process.env.META_WA_TOKEN
  if (!token) return undefined
  try {
    const res  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    return data.url as string | undefined
  } catch {
    return undefined
  }
}
