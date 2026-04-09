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
  updatedAt: string
}

const NAV = [
  { id: 'solicitudes', label: 'Solicitudes',   icon: '◈' },
  { id: 'metricas',   label: 'Métricas',        icon: '◎' },
  { id: 'pdf',        label: 'Exportar PDF',    icon: '↓' },
]

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
  const [activeNav, setActiveNav]         = useState('solicitudes')
  const [pdfDesde, setPdfDesde]           = useState('')
  const [pdfHasta, setPdfHasta]           = useState('')
  const [pdfCliente, setPdfCliente]       = useState('todos')

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/solicitudes')
    if (res.ok) setSolicitudes(await res.json())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPerm(Notification.permission)
      if (Notification.permission === 'default') Notification.requestPermission().then(p => setNotifPerm(p))
    }
  }, [])

  useEffect(() => {
    const iv = setInterval(async () => {
      const res = await fetch(`/api/notifications?since=${lastPoll}`)
      if (res.ok) {
        const { count } = await res.json()
        if (count > 0) {
          setNuevas(n => n + count)
          fetchAll()
          setLastPoll(new Date().toISOString())
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Nueva solicitud — Relevvo Studio', { body: `${count} nueva${count > 1 ? 's' : ''} solicitud${count > 1 ? 'es' : ''}.`, icon: '/icon.png' })
          }
        }
      }
    }, 15000)
    return () => clearInterval(iv)
  }, [lastPoll, fetchAll])

  function openEdit(s: Solicitud) { setEditId(s.id); setEditEstado(s.estado); setEditNota(s.nota ?? '') }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)
    const res = await fetch(`/api/solicitudes/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: editEstado, nota: editNota }),
    })
    setSaving(false); setEditId(null)
    if (res.ok) fetchAll()
  }

  const estadoInfo = (e: string) => ESTADOS.find(s => s.value === e) ?? ESTADOS[0]

  const filtered = solicitudes.filter(s =>
    (filtroCliente === 'todos' || s.cliente === filtroCliente) &&
    (filtroEstado  === 'todos' || s.estado  === filtroEstado)
  )

  const counts = ESTADOS.reduce((acc, e) => {
    acc[e.value] = solicitudes.filter(s => s.estado === e.value).length
    return acc
  }, {} as Record<string, number>)

  const metricasCliente = CLIENTES.map(c => {
    const todas       = solicitudes.filter(s => s.cliente === c)
    const completadas = todas.filter(s => s.estado === 'completada')
    const tiempos     = completadas.map(s => (new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime()) / 3600000)
    const promedio    = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null
    return { cliente: c, total: todas.length, completadas: completadas.length, promedioHoras: promedio }
  }).filter(m => m.total > 0).sort((a, b) => b.total - a.total)

  function generarPDF() {
    const desde = pdfDesde ? new Date(pdfDesde) : null
    const hasta = pdfHasta ? new Date(pdfHasta + 'T23:59:59') : null
    const data = solicitudes.filter(s => {
      const f = new Date(s.createdAt)
      if (desde && f < desde) return false
      if (hasta && f > hasta) return false
      if (pdfCliente !== 'todos' && s.cliente !== pdfCliente) return false
      return true
    })
    const rows = data.map(s => {
      const est  = ESTADOS.find(e => e.value === s.estado)?.label ?? s.estado
      const urg  = URGENCIAS.find(u => u.value === s.urgencia)?.label ?? s.urgencia
      const fecha = new Date(s.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
      return `<tr><td>${fecha}</td><td>${s.cliente}</td><td>${s.tipo}</td><td>${urg.replace(/[🟢🟡🔴]/g,'').trim()}</td><td>${est}</td><td style="max-width:260px;word-wrap:break-word">${s.descripcion}</td><td>${s.nota ?? '—'}</td></tr>`
    }).join('')
    const periodo = desde || hasta ? `${pdfDesde || '...'} → ${pdfHasta || 'hoy'}` : 'Todas las fechas'
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Relevvo</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px}h1{font-size:17px;margin-bottom:4px}p{color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse}th{background:#5E00A8;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#f9f7ff}</style>
    </head><body>
    <h1>Solicitudes — Relevvo Studio</h1>
    <p>Cliente: <strong>${pdfCliente === 'todos' ? 'Todos' : pdfCliente}</strong> &nbsp;|&nbsp; Período: <strong>${periodo}</strong> &nbsp;|&nbsp; Total: <strong>${data.length}</strong></p>
    <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Urgencia</th><th>Estado</th><th>Descripción</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('', '_blank'); win?.document.write(html); win?.document.close()
  }

  const STAT_CARDS = [
    { label: 'Total',       value: solicitudes.length,       color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    { label: 'Pendientes',  value: counts['pendiente']  ?? 0, color: '#E91E8C', bg: 'rgba(233,30,140,0.1)' },
    { label: 'En proceso',  value: counts['en_proceso'] ?? 0, color: '#7B00D4', bg: 'rgba(123,0,212,0.1)'  },
    { label: 'Completadas', value: counts['completada'] ?? 0, color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  ]

  return (
    <div className="flex min-h-screen" style={{ background: '#06000F' }}>

      {/* ── SIDEBAR ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col py-8 px-5 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        {/* Logo */}
        <div className="mb-10">
          <p className="text-white/25 text-xs tracking-widest uppercase mb-2">Panel</p>
          <img src="/logo.png" alt="Relevvo Studio" className="h-8 object-contain object-left" />
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          <p className="text-white/25 text-xs tracking-widest uppercase mb-2">Menú</p>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
              style={{
                background: activeNav === item.id ? 'rgba(94,0,168,0.3)' : 'transparent',
                color: activeNav === item.id ? '#c084fc' : 'rgba(255,255,255,0.45)',
                borderLeft: activeNav === item.id ? '2px solid #E91E8C' : '2px solid transparent',
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="mt-auto space-y-3">
          {notifPerm !== 'granted' && (
            <button
              onClick={() => Notification.requestPermission().then(p => setNotifPerm(p))}
              className="w-full text-xs px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: 'rgba(94,0,168,0.15)', color: '#a78bfa' }}
            >
              🔔 Activar alertas
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-left"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <span>⎋</span> Salir
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-white font-semibold text-lg capitalize">
              {NAV.find(n => n.id === activeNav)?.label ?? 'Panel'}
            </h1>
            <p className="text-white/30 text-xs mt-0.5">
              {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {nuevas > 0 && (
              <button
                onClick={() => setNuevas(0)}
                className="relative text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(233,30,140,0.15)', color: '#E91E8C', border: '1px solid rgba(233,30,140,0.3)' }}
              >
                {nuevas} nueva{nuevas > 1 ? 's' : ''} ✦
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg,#5E00A8,#E91E8C)', color: '#fff' }}>
                R
              </div>
              <span className="text-white/60 text-xs">Relevvo Studio</span>
            </div>
          </div>
        </header>

        <div className="flex-1 px-8 py-7 overflow-auto">

          {/* ── STAT CARDS (always visible) ── */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {STAT_CARDS.map(c => (
              <div key={c.label} className="rounded-2xl px-5 py-4" style={{ background: c.bg, border: `1px solid ${c.color}20` }}>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-3xl font-bold font-display" style={{ color: c.color }}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── SOLICITUDES ── */}
          {activeNav === 'solicitudes' && (
            <div>
              {/* Filters row */}
              <div className="flex flex-wrap gap-3 mb-5">
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="input text-sm py-2 w-auto">
                  <option value="todos">Todos los clientes</option>
                  {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="input text-sm py-2 w-auto">
                  <option value="todos">Todos los estados</option>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <span className="text-white/30 text-sm self-center ml-auto">
                  {filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-2xl flex items-center justify-center py-20" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                  <p className="text-white/25 text-sm">No hay solicitudes con estos filtros.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(s => {
                    const est = estadoInfo(s.estado)
                    const urg = URGENCIAS.find(u => u.value === s.urgencia)
                    const isEditing = editId === s.id
                    return (
                      <div key={s.id} className="rounded-2xl p-5 transition-all" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: 'rgba(94,0,168,0.25)', color: '#c084fc', border: '1px solid rgba(94,0,168,0.4)' }}>
                              {s.cliente}
                            </span>
                            <span className="text-white font-medium text-sm">{s.tipo}</span>
                            {urg && <span className="text-xs text-white/30">{urg.label}</span>}
                            <span className="text-white/20 text-xs">
                              {new Date(s.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: `${est.color}18`, color: est.color, border: `1px solid ${est.color}35` }}>
                              {est.label}
                            </span>
                            <button onClick={() => isEditing ? setEditId(null) : openEdit(s)}
                              className="text-white/30 hover:text-white text-xs transition-colors px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.05)' }}>
                              {isEditing ? 'Cancelar' : 'Editar'}
                            </button>
                          </div>
                        </div>

                        <p className="text-white/50 text-sm leading-relaxed">{s.descripcion}</p>

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
                                <select value={editEstado} onChange={e => setEditEstado(e.target.value)} className="input">
                                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="label">Nota para el cliente (opcional)</label>
                              <textarea value={editNota} onChange={e => setEditNota(e.target.value)}
                                rows={2} placeholder="Ej: Lo tenemos para el jueves…" className="input resize-none" />
                            </div>
                            <button onClick={saveEdit} disabled={saving} className="btn-primary text-sm py-2 px-6">
                              {saving ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MÉTRICAS ── */}
          {activeNav === 'metricas' && (
            <div className="space-y-6">
              <section>
                <h2 className="text-white/40 text-xs tracking-widest uppercase mb-4">Solicitudes por cliente</h2>
                {metricasCliente.length === 0 ? (
                  <p className="text-white/25 text-sm">Sin datos aún.</p>
                ) : (
                  <div className="space-y-2">
                    {metricasCliente.map(m => {
                      const max = metricasCliente[0].total
                      const pct = Math.round((m.total / max) * 100)
                      return (
                        <div key={m.cliente} className="rounded-2xl px-5 py-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white text-sm font-medium">{m.cliente}</span>
                            <span className="text-white/40 text-xs">{m.total} total · {m.completadas} completadas</span>
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#5E00A8,#E91E8C)' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-white/40 text-xs tracking-widest uppercase mb-4">Tiempo promedio de resolución</h2>
                {metricasCliente.filter(m => m.promedioHoras !== null).length === 0 ? (
                  <p className="text-white/25 text-sm">Sin solicitudes completadas aún.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {metricasCliente.filter(m => m.promedioHoras !== null).map(m => {
                      const h = m.promedioHoras!
                      const t = h < 1 ? `${Math.round(h*60)} min` : h < 24 ? `${h.toFixed(1)} h` : `${(h/24).toFixed(1)} días`
                      return (
                        <div key={m.cliente} className="rounded-2xl text-center py-5" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                          <p className="text-2xl font-bold font-display" style={{ color: '#a78bfa' }}>{t}</p>
                          <p className="text-white/40 text-xs mt-1">{m.cliente}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── PDF ── */}
          {activeNav === 'pdf' && (
            <div className="max-w-md">
              <h2 className="text-white/40 text-xs tracking-widest uppercase mb-4">Configurar reporte</h2>
              <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Desde</label>
                    <input type="date" value={pdfDesde} onChange={e => setPdfDesde(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">Hasta</label>
                    <input type="date" value={pdfHasta} onChange={e => setPdfHasta(e.target.value)} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Cliente</label>
                  <select value={pdfCliente} onChange={e => setPdfCliente(e.target.value)} className="input">
                    <option value="todos">Todos los clientes</option>
                    {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={generarPDF} className="btn-primary w-full">
                  ↓ Generar PDF
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
