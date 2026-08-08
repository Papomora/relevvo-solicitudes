import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { handleIncomingMessage } from '@/lib/whatsapp-agent'
import { prisma } from '@/lib/prisma'
import { isTeamPhone, getTeamMemberName, saveBillingPdf } from '@/lib/billing-storage'
import { sendWA } from '@/lib/whatsapp-send'

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

  const value    = body?.entry?.[0]?.changes?.[0]?.value
  const messages = value?.messages
  const statuses = value?.statuses

  // Handle delivery/read status updates for prospect tracking
  if (statuses?.length) {
    for (const s of statuses) {
      const recipientPhone = (s.recipient_id as string ?? '').replace(/^(\+?)/, '+')
      if (s.status === 'delivered') {
        await prisma.prospectoSession.updateMany({
          where: { phone: recipientPhone },
          data:  { entregado: true },
        }).catch(() => {})
      } else if (s.status === 'read') {
        await prisma.prospectoSession.updateMany({
          where: { phone: recipientPhone },
          data:  { leido: true },
        }).catch(() => {})
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (!messages?.length) return NextResponse.json({ ok: true })

  const msg  = messages[0]
  const from = msg.from as string // e.g. "573001234567"
  const phone = from.startsWith('+') ? from : `+${from}`

  let text     = ''
  let mediaInfo: { url: string; mimeType: string; ext: string } | undefined

  switch (msg.type) {
    case 'text':
      text = msg.text?.body ?? ''
      break
    case 'image':
      mediaInfo = await fetchMediaInfo(msg.image?.id, 'image/jpeg', 'jpg')
      text = msg.image?.caption ?? ''
      break
    case 'document':
      mediaInfo = await fetchMediaInfo(msg.document?.id, msg.document?.mime_type ?? 'application/octet-stream', msg.document?.filename?.split('.').pop() ?? 'bin')
      text = msg.document?.caption ?? ''
      break
    case 'video':
      mediaInfo = await fetchMediaInfo(msg.video?.id, 'video/mp4', 'mp4')
      text = msg.video?.caption ?? ''
      break
    case 'audio':
      text = '[Mensaje de voz — no puedo procesar audio]'
      break
    default:
      return NextResponse.json({ ok: true })
  }

  // ── Billing PDF intercept ─────────────────────────────────────
  // If the sender is a team member AND sent a PDF → save as cuenta de cobro
  if (
    isTeamPhone(phone) &&
    msg.type === 'document' &&
    mediaInfo &&
    (mediaInfo.mimeType === 'application/pdf' || mediaInfo.ext === 'pdf')
  ) {
    try {
      const memberName = getTeamMemberName(phone)
      const { driveUrl } = await saveBillingPdf(mediaInfo.url, phone)

      const yearMonth = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
      const confirmMsg = driveUrl
        ? `✅ ¡Listo ${memberName}! Tu cuenta de cobro de *${yearMonth}* fue guardada correctamente.\n📁 ${driveUrl}`
        : `✅ ¡Listo ${memberName}! Tu cuenta de cobro de *${yearMonth}* fue recibida y guardada.`

      await sendWA(phone, confirmMsg).catch(() => {})

      // Also notify admin phones
      const adminMsg = `📎 *Cuenta de cobro recibida*\n👤 ${memberName}\n📅 ${yearMonth}${driveUrl ? `\n📁 ${driveUrl}` : ''}`
      for (let i = 1; i <= 3; i++) {
        const p = process.env[`WHATSAPP_PHONE_${i}`]
        const k = process.env[`WHATSAPP_APIKEY_${i}`]
        if (p && k) {
          fetch(`https://api.callmebot.com/whatsapp.php?phone=${p}&text=${encodeURIComponent(adminMsg)}&apikey=${k}`).catch(() => {})
        }
      }
    } catch (e) {
      console.error('[webhook] billing PDF handling failed:', e)
      await sendWA(phone, '⚠️ Recibí tu PDF pero hubo un error al guardarlo. Avisa al admin.').catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  // Await handler — fire-and-forget caused silent failures in serverless
  try {
    await handleIncomingMessage(phone, text, mediaInfo)
  } catch (e) {
    console.error('[webhook] handleIncomingMessage failed:', e)
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ───────────────────────────────────────────────────
async function fetchMediaInfo(
  mediaId?: string, mimeType = 'application/octet-stream', ext = 'bin'
): Promise<{ url: string; mimeType: string; ext: string } | undefined> {
  if (!mediaId) return undefined
  const token = process.env.META_WA_TOKEN
  if (!token) return undefined
  try {
    const res  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as any
    if (!data.url) return undefined
    return { url: data.url as string, mimeType: data.mime_type ?? mimeType, ext }
  } catch {
    return undefined
  }
}
