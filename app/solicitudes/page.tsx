'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { TIPOS, URGENCIAS, ESTADOS } from '@/lib/constants'

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

export default function SolicitudesPage() {
  const { data: session } = useSession()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [tipo, setTipo]               = useState('')
  const [urgencia, setUrgencia]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [sending, setSending]         = useState(false)
  const [success, setSuccess]         = useState(false)
  const [error, setError]             = useState('')
  const [lastPoll, setLastPoll]       = useState(new Date().toISOString())

  const fetchSolicitudes = useCallback(async () => {
    const res = await fetch('/api/solicitudes')
    if (res.ok) setSolicitudes(await res.json())
  }, [])

  useEffect(() => { fetchSolicitudes() }, [fetchSolicitudes])

  // Poll every 15s for status updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/notifications?since=${lastPoll}`)
      if (res.ok) {
        const { count } = await res.json()
        if (count > 0) {
          fetchSolicitudes()
          setLastPoll(new Date().toISOString())
        }
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [lastPoll, fetchSolicitudes])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!tipo || !urgencia || !descripcion.trim()) {
      setError('Completa todos los campos.')
      return
    }
    setSending(true)
    const res = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, urgencia, descripcion }),
    })
    setSending(false)

    if (res.ok) {
      setSuccess(true)
      setTipo('')
      setUrgencia('')
      setDescripcion('')
      fetchSolicitudes()
      setTimeout(() => setSuccess(false), 3000)
    } else {
      setError('Error al enviar. Intenta de nuevo.')
    }
  }

  const estadoInfo = (e: string) =>
    ESTADOS.find(s => s.value === e) ?? ESTADOS[0]

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-white/30 text-xs tracking-widest uppercase mb-1">Portal</p>
          <img src="/logo.png" alt="Relevvo Studio" className="h-9 object-contain" />
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-white/30 hover:text-white/70 text-sm transition-colors"
        >
          Salir →
        </button>
      </div>

      {/* Form */}
      <section className="card mb-8">
        <h2 className="text-white font-semibold mb-5 text-sm tracking-wide uppercase">
          Nueva solicitud
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className="input">
                <option value="">Selecciona…</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Urgencia</label>
              <select value={urgencia} onChange={e => setUrgencia(e.target.value)} className="input">
                <option value="">Selecciona…</option>
                {URGENCIAS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Describe lo que necesitas con el mayor detalle posible…"
              className="input resize-none"
            />
          </div>

          {error   && <p className="text-magenta text-sm">{error}</p>}
          {success && <p className="text-green-400 text-sm">✓ Solicitud enviada correctamente.</p>}

          <button type="submit" disabled={sending} className="btn-primary w-full">
            {sending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      </section>

      {/* Bitácora */}
      <section>
        <h2 className="text-white/50 text-xs tracking-widest uppercase mb-4">
          Historial de solicitudes
        </h2>

        {solicitudes.length === 0 ? (
          <p className="text-white/25 text-sm text-center py-10">
            Aún no tienes solicitudes enviadas.
          </p>
        ) : (
          <div className="space-y-3">
            {solicitudes.map(s => {
              const est = estadoInfo(s.estado)
              const urg = URGENCIAS.find(u => u.value === s.urgencia)
              return (
                <div key={s.id} className="card">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-white font-medium text-sm">{s.tipo}</span>
                      <span className="text-white/30 text-xs ml-2">
                        {new Date(s.createdAt).toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </span>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      style={{ background: `${est.color}20`, color: est.color, border: `1px solid ${est.color}40` }}
                    >
                      {est.label}
                    </span>
                  </div>

                  <p className="text-white/50 text-sm leading-relaxed mb-2">{s.descripcion}</p>

                  <div className="flex items-center gap-3 flex-wrap">
                    {urg && (
                      <span className="text-xs text-white/30">{urg.label}</span>
                    )}
                  </div>

                  {s.nota && (
                    <div className="mt-3 pt-3 border-t border-white/8">
                      <p className="text-xs text-purple font-semibold mb-1">Nota de Relevvo:</p>
                      <p className="text-white/60 text-sm">{s.nota}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
