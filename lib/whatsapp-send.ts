// Meta WhatsApp Cloud API — send a text message
export async function sendWA(to: string, text: string): Promise<void> {
  const token   = process.env.META_WA_TOKEN
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    console.error('[sendWA] Missing META_WA_TOKEN or META_WA_PHONE_NUMBER_ID')
    return
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[sendWA] Meta API error ${res.status} to ${to}:`, err)
    } else {
      console.log(`[sendWA] Sent OK to ${to}`)
    }
  } catch (e) {
    console.error('[sendWA] fetch failed:', e)
  }
}

// Meta WhatsApp Cloud API — send an approved template message
// Returns: Meta message ID (wamid) or null
export async function sendWATemplate(
  to: string, templateName: string, params: string[] = [], langCode = 'es'
): Promise<{ id: string | null; error?: string }> {
  const token   = process.env.META_WA_TOKEN
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !phoneId) return { id: null, error: 'Missing META_WA_TOKEN or META_WA_PHONE_NUMBER_ID' }

  const components = params.length > 0 ? [{
    type: 'body',
    parameters: params.map(text => ({ type: 'text', text })),
  }] : []

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: langCode }, components },
      }),
    })
    const data = await res.json() as any
    if (!res.ok) {
      const errMsg = data?.error?.message ?? JSON.stringify(data)
      console.error(`[sendWATemplate] ${res.status} to ${to}:`, errMsg)
      return { id: null, error: errMsg }
    }
    const msgId = data?.messages?.[0]?.id ?? null
    console.log(`[sendWATemplate] Sent "${templateName}" to ${to} — id: ${msgId}`)
    return { id: msgId }
  } catch (e: any) {
    console.error('[sendWATemplate] fetch failed:', e)
    return { id: null, error: e?.message ?? String(e) }
  }
}
