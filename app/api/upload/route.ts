import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED  = ['image/jpeg','image/png','image/webp','image/gif','image/jpg','application/pdf']

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file)                         return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  if (file.size > MAX_SIZE)          return NextResponse.json({ error: 'Archivo muy grande (máx. 10 MB)' }, { status: 413 })
  if (!ALLOWED.includes(file.type))  return NextResponse.json({ error: 'Tipo no permitido (PNG, JPG, PDF)' }, { status: 415 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const blob = await put(`referencias/${Date.now()}-${safeName}`, file, { access: 'public' })

  return NextResponse.json({ url: blob.url, name: file.name, size: file.size })
}
