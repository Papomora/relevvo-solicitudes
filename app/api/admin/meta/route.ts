import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token   = process.env.META_WA_TOKEN
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !phoneId)
    return NextResponse.json({ error: 'Missing META_WA_TOKEN or META_WA_PHONE_NUMBER_ID' })

  try {
    // Step 1: get WABA id from phone number
    const phoneRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}?fields=id,verified_name,display_phone_number,account_id`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const phoneData = await phoneRes.json() as any
    if (!phoneRes.ok) return NextResponse.json({ step: 'phone', error: phoneData })

    const wabaId = phoneData.account_id
    if (!wabaId) return NextResponse.json({ step: 'phone', data: phoneData, error: 'no account_id' })

    // Step 2: list templates
    const tplRes = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=name,language,status&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const tplData = await tplRes.json() as any

    return NextResponse.json({
      phone: phoneData,
      wabaId,
      templates: tplData?.data ?? tplData,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
