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
// params: array of text values for {{1}}, {{2}}, etc. in the template body
export async function sendWATemplate(
  to: string, templateName: string, params: string[] = []
): Promise<void> {
  const token   = process.env.META_WA_TOKEN
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !phoneId) return

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
        template: { name: templateName, language: { code: 'es' }, components },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[sendWATemplate] ${res.status} to ${to}:`, err)
    } else {
      console.log(`[sendWATemplate] Sent "${templateName}" to ${to}`)
    }
  } catch (e) {
    console.error('[sendWATemplate] fetch failed:', e)
  }
}
