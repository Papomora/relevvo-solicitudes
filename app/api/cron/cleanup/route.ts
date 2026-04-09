import { NextRequest, NextResponse } from 'next/server'
import { list, del } from '@vercel/blob'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Protect cron: Vercel sends Authorization: Bearer <CRON_SECRET>
  if (process.env.NODE_ENV !== 'development') {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
  let deleted = 0
  let cursor: string | undefined

  // Paginate through all blobs with prefix "referencias/"
  do {
    const result = await list({ prefix: 'referencias/', cursor, limit: 100 })
    const old = result.blobs.filter(b => new Date(b.uploadedAt) < cutoff)
    if (old.length > 0) {
      await del(old.map(b => b.url))
      deleted += old.length
    }
    cursor = result.cursor
  } while (cursor)

  return NextResponse.json({ deleted, cutoff: cutoff.toISOString() })
}
