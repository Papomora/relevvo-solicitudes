import { NextRequest, NextResponse } from 'next/server'
import { list, del } from '@vercel/blob'

export const runtime = 'nodejs'

function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  // timing-safe comparison — prevent timing attacks
  if (provided.length !== expected.length) return false
  const { timingSafeEqual } = require('crypto') as typeof import('crypto')
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export async function GET(req: NextRequest) {
  // Always verify — never skip in development
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
