/**
 * billing-storage.ts
 * Downloads a PDF from Meta CDN and uploads it to Google Drive
 * under the folder structure: Cuentas de Cobro / YYYY-MM / [nombre].pdf
 *
 * Env vars required:
 *   GOOGLE_DRIVE_SA_KEY          — Service Account JSON (same as google-drive.ts)
 *   GOOGLE_DRIVE_CUENTAS_FOLDER  — ID of the root "Cuentas de Cobro" Drive folder
 *   META_WA_TOKEN                — Meta Graph API token (to download media)
 *
 * Optional:
 *   TEAM_MEMBER_MAP  — "phone:name" pairs, comma-separated
 *                       e.g. "573223094005:Camilo,573001234567:Daniela"
 */

import { createSign } from 'crypto'
import path from 'path'
import fs from 'fs/promises'

// ── Google token (same pattern as google-drive.ts) ─────────────
async function getGoogleToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_DRIVE_SA_KEY
  if (!saJson) return null
  try {
    const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
    const now = Math.floor(Date.now() / 1000)
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      iss:   sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud:   'https://oauth2.googleapis.com/token',
      exp:   now + 3600,
      iat:   now,
    })).toString('base64url')
    const sign = createSign('RSA-SHA256')
    sign.update(`${header}.${payload}`)
    const sig = sign.sign(sa.private_key, 'base64url')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion:  `${header}.${payload}.${sig}`,
      }),
    })
    const data = await res.json() as any
    return data.access_token ?? null
  } catch (e) {
    console.error('[billing] google token error:', e)
    return null
  }
}

// ── Get or create a Drive folder by name under a parent ────────
async function ensureDriveFolder(token: string, name: string, parentId: string): Promise<string | null> {
  try {
    // Search for existing folder
    const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const searchData = await searchRes.json() as any
    if (searchData.files?.length > 0) return searchData.files[0].id as string

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents:  [parentId],
      }),
    })
    const createData = await createRes.json() as any
    console.log(`[billing] created Drive folder "${name}" → ${createData.id}`)
    return createData.id ?? null
  } catch (e) {
    console.error('[billing] ensureDriveFolder error:', e)
    return null
  }
}

// ── Get team member name from phone ────────────────────────────
export function getTeamMemberName(phone: string): string {
  const map = process.env.TEAM_MEMBER_MAP ?? ''
  const normalized = phone.replace(/^\+/, '')
  for (const pair of map.split(',')) {
    const [p, name] = pair.trim().split(':')
    if (p && name && (p === normalized || `+${p}` === phone || p === phone)) {
      return name.trim()
    }
  }
  // Fallback: use last 4 digits
  return `integrante_${phone.slice(-4)}`
}

// ── Check if a phone belongs to the team ───────────────────────
export function isTeamPhone(phone: string): boolean {
  const normalized = phone.replace(/^\+/, '')

  // Check TEAM_ALERT_PHONES
  const alertPhones = (process.env.TEAM_ALERT_PHONES ?? '')
    .split(',').map(p => p.trim().replace(/^\+/, '')).filter(Boolean)
  if (alertPhones.includes(normalized)) return true

  // Check individual WHATSAPP_PHONE_1/2/3
  for (let i = 1; i <= 3; i++) {
    const p = (process.env[`WHATSAPP_PHONE_${i}`] ?? '').replace(/^\+/, '')
    if (p && p === normalized) return true
  }

  return false
}

// ── Main: save billing PDF ─────────────────────────────────────
// Returns: Drive webViewLink or local path or null
export async function saveBillingPdf(
  cdnUrl:      string,
  memberPhone: string,
): Promise<{ driveUrl: string | null; localPath: string | null }> {
  const memberName = getTeamMemberName(memberPhone)
  const now        = new Date()
  const yearMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const timestamp  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename   = `${memberName}_${yearMonth}_${timestamp}.pdf`

  console.log(`[billing] Saving PDF for ${memberName} (${yearMonth}): ${filename}`)

  // 1. Download PDF from Meta CDN
  const metaToken = process.env.META_WA_TOKEN
  if (!metaToken) {
    console.error('[billing] META_WA_TOKEN not set')
    return { driveUrl: null, localPath: null }
  }

  let fileBuffer: Buffer
  try {
    const res = await fetch(cdnUrl, { headers: { Authorization: `Bearer ${metaToken}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fileBuffer = Buffer.from(await res.arrayBuffer())
    console.log(`[billing] Downloaded PDF: ${fileBuffer.length} bytes`)
  } catch (e) {
    console.error('[billing] download error:', e)
    return { driveUrl: null, localPath: null }
  }

  // 2. Save locally (as fallback / local dev)
  let localPath: string | null = null
  try {
    const dir = path.join(process.cwd(), 'cuentas-cobro', yearMonth)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, filename)
    await fs.writeFile(filePath, fileBuffer)
    localPath = filePath
    console.log(`[billing] Saved locally: ${filePath}`)
  } catch (e) {
    console.warn('[billing] local save failed (expected in serverless):', (e as Error).message)
  }

  // 3. Upload to Google Drive
  const rootFolderId = process.env.GOOGLE_DRIVE_CUENTAS_FOLDER
  if (!rootFolderId) {
    console.warn('[billing] GOOGLE_DRIVE_CUENTAS_FOLDER not set — skipping Drive upload')
    return { driveUrl: null, localPath }
  }

  const token = await getGoogleToken()
  if (!token) return { driveUrl: null, localPath }

  // Ensure month subfolder exists
  const monthFolderId = await ensureDriveFolder(token, yearMonth, rootFolderId)
  if (!monthFolderId) return { driveUrl: null, localPath }

  // Upload PDF
  const boundary = 'billing_boundary_relevvo'
  const metadata = JSON.stringify({ name: filename, parents: [monthFolderId] })
  const partHead  = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/pdf',
    '',
    '',
  ].join('\r\n')
  const partTail = `\r\n--${boundary}--`
  const body     = Buffer.concat([Buffer.from(partHead), fileBuffer, Buffer.from(partTail)])

  try {
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method:  'POST',
        headers: {
          Authorization:    `Bearer ${token}`,
          'Content-Type':   `multipart/related; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
        },
        body,
      }
    )
    if (!uploadRes.ok) {
      console.error('[billing] Drive upload failed:', await uploadRes.text())
      return { driveUrl: null, localPath }
    }
    const data = await uploadRes.json() as any
    console.log(`[billing] Uploaded to Drive: ${filename} → ${data.id}`)
    return { driveUrl: data.webViewLink ?? null, localPath }
  } catch (e) {
    console.error('[billing] Drive upload error:', e)
    return { driveUrl: null, localPath }
  }
}
