'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { ESTADOS, CLIENTES, URGENCIAS } from '@/lib/constants'

type Solicitud = {
  id: number
  cliente: string
  tipo: string
  urgencia: string
  descripcion: string
  estado: string
  nota: string | null
  createdAt: string
}

export default function AdminPage() {
  const { data: session } = useSession()
  const [solicitudes, setSolicitudes]     = useState<Solicitud[]>([])
  const [filtroCliente, setFiltroCliente] = useState('todos')
  const [filtroEstado, setFiltroEstado]   = useState('todos')
  const [editId, setEditId]               = useState<number | null>(null)
  const [editEstado, setEditEstado]       = useState('')
  const [editNota, setEditNota]           = useState('')
  const [saving, setSaving]               = useState(false)
  const [lastPoll, setLastPoll]           = useState(new Date().toISOString())
  const [nuevas, setNuevas]               = useState(0)
  const [notifPerm, setNotifPerm]         = useState<NotificationPermission>('default')

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/solicitudes')
    if (res.ok) setSolicitudes(await res.json())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Request browser notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPerm(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => setNotifPerm(p))
      }
    }
  }, [])

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/notifications?since=${lastPoll}`)
      if (res.ok) {
        const { count } = await res.json()
        if (count > 0) {
          setNuevas(n => n + count)
          fetchAll()
          setLastPoll(new Date().toISOString())
          // Browser notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Nueva solicitud — Relevvo Studio', {
              body: `${count} nueva${count > 1 ? 's' : ''} solicitud${count > 1 ? 'es' : ''} recibida${count > 1 ? 's' : ''}.`,
              icon: '/icon.png',
            })
          }
        }
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [lastPoll, fetchAll])

  function openEdit(s: Solicitud) {
    setEditId(s.id)
    setEditEstado(s.estado)
    setEditNota(s.nota ?? '')
  }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)
    await fetch(`/api/solicitudes/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: editEstado, nota: editNota }),
    })
    setSaving(false)
    setEditId(null)
    fetchAll()
  }

  const estadoInfo = (e: string) =>
    ESTADOS.find(s => s.value === e) ?? ESTADOS[0]

  const filtered = solicitudes.filter(s => {
    const okCliente = filtroCliente === 'todos' || s.cliente === filtroCliente
    const okEstado  = filtroEstado  === 'todos' || s.estado  === filtroEstado
    return okCliente && okEstado
  })

  const counts = ESTADOS.reduce((acc, e) => {
    acc[e.value] = solicitudes.filter(s => s.estado === e.value).length
    return acc
  }, {} as Record<string, number>)

  return (
    <main className="min-h-screen px-4 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-white/30 text-xs tracking-widest uppercase mb-1">Panel</p>
          <img src="/logo.png" alt="Relevvo Studio" className="h-10 object-contain" />
        </div>
        <div className="flex items-center gap-4">
          {notifPerm !== 'granted' && (
            <button
              onClick={() => Notification.requestPermission().then(p => setNotifPerm(p))}
              className="text-xs px-3 py-1 rounded-full"
              style={{ background: 'rgba(94,0,168,0.2)', color: '#a78bfa', border: '1px solid rgba(94,0,168,0.4)' }}
            >
              🔔 Activar alertas
            </button>
          )}
          {nuevas > 0 && (
            <button
              onClick={() => setNuevas(0)}
              className="text-xs px-3 py-1 rounded-full"
              style={{ background: 'rgba(233,30,140,0.2)', color: '#E91E8C', border: '1px solid rgba(233,30,140,0.3)' }}
            >
              {nuevas} nueva{nuevas > 1 ? 's' : ''} ✦
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="text-white/30 hover:text-white/70 text-sm transition-colors"
          >
            Salir →
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {ESTADOS.map(e => (
          <div key={e.value} className="card text-center py-4">
            <p
              className="text-2xl font-bold font-display"
              style={{ color: e.color }}
            >
              {counts[e.value] ?? 0}
            </p>
            <p className="text-white/40 text-xs mt-1">{e.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filtroCliente}
          onChange={e => setFiltroCliente(e.target.value)}
          className="input text-sm py-2 w-auto"
        >
          <option value="todos">Todos los clientes</option>
          {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="input text-sm py-2 w-auto"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>

        <span className="text-white/30 text-sm self-center ml-auto">
          {filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-white/25 text-sm text-center py-16">No hay solicitudes.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const est = estadoInfo(s.estado)
            const urg = URGENCIAS.find(u => u.value === s.urgencia)
            const isEditing = editId === s.id

            return (
              <div key={s.id} className="card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Client tag */}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(94,0,168,0.25)', color: '#c084fc', border: '1px solid rgba(94,0,168,0.4)' }}
                    >
                      {s.cliente}
                    </span>
                    <span className="text-white font-medium text-sm">{s.tipo}</span>
                    {urg && <span className="text-xs text-white/30">{urg.label}</span>}
                    <span className="text-white/20 text-xs">
                      {new Date(s.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${est.color}20`, color: est.color, border: `1px solid ${est.color}40` }}
                    >
                      {est.label}
                    </span>
                    <button
                      onClick={() => isEditing ? setEditId(null) : openEdit(s)}
                      className="text-white/30 hover:text-white text-xs transition-colors"
                    >
                      {isEditing ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>
                </div>

                <p className="text-white/55 text-sm leading-relaxed">{s.descripcion}</p>

                {s.nota && !isEditing && (
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <p className="text-xs font-semibold mb-1" style={{ color: '#a78bfa' }}>Nota interna:</p>
                    <p className="text-white/50 text-sm">{s.nota}</p>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Estado</label>
                        <select
                          value={editEstado}
                          onChange={e => setEditEstado(e.target.value)}
                          className="input"
                        >
                          {ESTADOS.map(e => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Nota para el cliente (opcional)</label>
                      <textarea
                        value={editNota}
                        onChange={e => setEditNota(e.target.value)}
                        rows={2}
                        placeholder="Ej: Lo tenemos para el jueves…"
                        className="input resize-none"
                      />
                    </div>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="btn-primary text-sm py-2 px-6"
                    >
                      {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
