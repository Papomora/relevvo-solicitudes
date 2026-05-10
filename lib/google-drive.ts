import { createSign } from 'crypto'

interface ServiceAccount {
  client_email: string
  private_key: string
}

// Exchange Service Account JSON for a Google OAuth2 access token (no extra packages)
async function getGoogleToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_DRIVE_SA_KEY
  if (!saJson) return null
  try {
    const sa: ServiceAccount = JSON.parse(saJson)
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

    const res  = await fetch('https://oauth2.googleapis.com/token', {
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
    console.error('[gdrive] token error:', e)
    return null
  }
}

// Download file from Meta CDN and upload to Google Drive
// Returns: Drive webViewLink or null on failure
export async function uploadMediaToDrive(
  cdnUrl:      string,
  mimeType:    string,
  ext:         string,   // e.g. "jpg", "pdf"
  cliente:     string,
  solicitudId: number,
): Promise<string | null> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const metaToken = process.env.META_WA_TOKEN
  if (!folderId || !metaToken) return null

  const token = await getGoogleToken()
  if (!token) return null

  // 1. Download from Meta (requires Authorization header)
  const fileRes = await fetch(cdnUrl, {
    headers: { Authorization: `Bearer ${metaToken}` },
  })
  if (!fileRes.ok) { console.error('[gdrive] download failed:', fileRes.status); return null }
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer())

  // 2. Build multipart upload body
  const filename  = `${cliente}_REL-${solicitudId}_${Date.now()}.${ext}`
  const metadata  = JSON.stringify({ name: filename, parents: [folderId] })
  const boundary  = 'gdrive_boundary_relevvo'
  const partHead  = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join('\r\n')
  const partTail  = `\r\n--${boundary}--`
  const body      = Buffer.concat([Buffer.from(partHead), fileBuffer, Buffer.from(partTail)])

  // 3. Upload
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method:  'POST',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    }
  )
  if (!uploadRes.ok) { console.error('[gdrive] upload failed:', await uploadRes.text()); return null }
  const data = await uploadRes.json() as any

  // 4. Make publicly readable (anyone with link)
  if (data.id) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => {})
  }

  console.log(`[gdrive] uploaded: ${filename}`)
  return data.webViewLink ?? null
}
