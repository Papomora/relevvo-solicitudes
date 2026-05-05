'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { CLIENTES } from '@/lib/constants'

const T = {
  bg: '#131313', card: 'rgba(42,42,42,0.6)', primary: '#D2BBFF',
  primaryC: '#7C3AED', secondary: '#41E575', surface: '#201F1F',
  onSurf: '#E5E2E1', muted: '#6B7280', border: 'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.08)', danger: '#FF6B6B',
}

type ClienteWA = { id: number; phone: string; nombre: string; activo: boolean; limiteMes: number; createdAt: string }

export default function ClientesWAPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteWA[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ phone: '', nombre: '', limiteMes: '10' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if ((session?.user as any)?.role !== 'admin' && status === 'authenticated') router.push('/')
  }, [session, status, router])

  async function load() {
    const r = await fetch('/api/clientes-wa')
    if (r.ok) setClientes(await r.json())
    setLoading(false)
  }

  useEffect(() => { if (status === 'authenticated') load() }, [status])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const r = await fetch('/api/clientes-wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, limiteMes: parseInt(form.limiteMes) }),
    })
    if (r.ok) { setForm({ phone: '', nombre: '', limiteMes: '10' }); await load() }
    else { const d = await r.json(); setError(d.error ?? 'Error') }
    setSaving(false)
  }

  async function toggleActivo(c: ClienteWA) {
    await fetch(`/api/clientes-wa/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
    })
    await load()
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este cliente WA?')) return
    await fetch(`/api/clientes-wa/${id}`, { method: 'DELETE' })
    await load()
  }

  const inp: React.CSSProperties = {
    background: T.surface, border: `1px solid ${T.borderMd}`, borderRadius: 8,
    color: T.onSurf, fontSize: 14, padding: '10px 14px', outline: 'none', width: '100%',
  }

  if (loading) return <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>Cargando...</div>

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '32px 24px', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
          <div>
            <h1 style={{ color: T.onSurf, fontSize: 22, fontWeight: 700, margin: 0 }}>Clientes WhatsApp</h1>
            <p style={{ color: T.muted, fontSize: 13, margin: '2px 0 0' }}>Números registrados para el agente WA</p>
          </div>
        </div>

        {/* Add form */}
        <div style={{ background: T.card, backdropFilter: 'blur(20px)', border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <h2 style={{ color: T.primary, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>+ Agregar cliente</h2>
          <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ color: T.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>Número (con +57)</label>
              <input style={inp} placeholder="+573001234567" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div>
              <label style={{ color: T.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>Cliente</label>
              <select style={{ ...inp }} value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required>
                <option value="">Seleccionar...</option>
                {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: T.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>Límite/mes</label>
              <input style={{ ...inp, width: 70 }} type="number" min={1} max={100} value={form.limiteMes}
                onChange={e => setForm(f => ({ ...f, limiteMes: e.target.value }))} />
            </div>
            <button type="submit" disabled={saving} style={{
              background: T.primaryC, color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '...' : 'Agregar'}
            </button>
          </form>
          {error && <p style={{ color: T.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clientes.length === 0 && (
            <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>No hay clientes registrados</p>
          )}
          {clientes.map(c => (
            <div key={c.id} style={{
              background: T.card, backdropFilter: 'blur(20px)', border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: c.activo ? T.secondary : T.muted,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: T.onSurf, fontWeight: 600, fontSize: 15 }}>{c.nombre}</div>
                <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{c.phone} · límite {c.limiteMes}/mes</div>
              </div>
              <button onClick={() => toggleActivo(c)} style={{
                background: 'none', border: `1px solid ${T.borderMd}`, borderRadius: 6,
                color: c.activo ? T.secondary : T.muted, fontSize: 12, padding: '4px 12px', cursor: 'pointer',
              }}>
                {c.activo ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={() => handleDelete(c.id)} style={{
                background: 'none', border: 'none', color: T.danger, fontSize: 18,
                cursor: 'pointer', padding: '0 4px', lineHeight: 1,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
