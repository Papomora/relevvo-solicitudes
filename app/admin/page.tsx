'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { ESTADOS, CLIENTES, URGENCIAS } from '@/lib/constants'

type Solicitud = {
  id: number; cliente: string; tipo: string; urgencia: string
  descripcion: string; estado: string; nota: string | null
  createdAt: string; updatedAt: string
}

// ── SVG Line Chart ─────────────────────────────────────────────
function LineChart({ data }: { data: { label: string; count: number }[] }) {
  const W = 100, H = 60, pad = 6
  const max = Math.max(...data.map(d => d.count), 1)
  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (W - pad * 2),
    y: H - pad - (d.count / max) * (H - pad * 2),
    ...d,
  }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L${pts[pts.length-1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E91E8C" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#E91E8C" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartGrad)"/>
      <path d={path} fill="none" stroke="#E91E8C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#E91E8C"/>
      ))}
    </svg>
  )
}

// ── Glass card ─────────────────────────────────────────────────
function GlassCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: '20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

export default function AdminPage() {
  const [solicitudes, setSolicitudes]   = useState<Solicitud[]>([])
  const [filtroCliente, setFiltroCliente] = useState('todos')
  const [filtroEstado, setFiltroEstado]   = useState('todos')
  const [editId, setEditId]             = useState<number | null>(null)
  const [editEstado, setEditEstado]     = useState('')
  const [editNota, setEditNota]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [lastPoll, setLastPoll]         = useState(new Date().toISOString())
  const [nuevas, setNuevas]             = useState(0)
  const [notifPerm, setNotifPerm]       = useState<NotificationPermission>('default')
  const [activeNav, setActiveNav]       = useState<'dash'|'lista'|'metricas'|'pdf'>('dash')
  const [pdfDesde, setPdfDesde]         = useState('')
  const [pdfHasta, setPdfHasta]         = useState('')
  const [pdfCliente, setPdfCliente]     = useState('todos')

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
          setNuevas(n => n + count); fetchAll(); setLastPoll(new Date().toISOString())
          if ('Notification' in window && Notification.permission === 'granted')
            new Notification('Nueva solicitud — Relevvo Studio', { body: `${count} nueva${count>1?'s':''} solicitud${count>1?'es':''}.`, icon: '/icon.png' })
        }
      }
    }, 15000)
    return () => clearInterval(iv)
  }, [lastPoll, fetchAll])

  function openEdit(s: Solicitud) { setEditId(s.id); setEditEstado(s.estado); setEditNota(s.nota ?? '') }
  async function saveEdit() {
    if (!editId) return; setSaving(true)
    const res = await fetch(`/api/solicitudes/${editId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({estado:editEstado,nota:editNota}) })
    setSaving(false); setEditId(null); if (res.ok) fetchAll()
  }

  const estadoInfo = (e: string) => ESTADOS.find(s => s.value === e) ?? ESTADOS[0]

  // ── Métricas ──────────────────────────────────────────────────
  const counts = useMemo(() => ESTADOS.reduce((acc, e) => { acc[e.value] = solicitudes.filter(s => s.estado === e.value).length; return acc }, {} as Record<string,number>), [solicitudes])

  const chartData = useMemo(() => Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i))
    const key = d.toISOString().slice(0,10)
    return { label: d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'}), count: solicitudes.filter(s => s.createdAt.slice(0,10)===key).length }
  }), [solicitudes])

  const topClientes = useMemo(() =>
    CLIENTES.map(c => ({ cliente: c, total: solicitudes.filter(s=>s.cliente===c).length }))
      .filter(m=>m.total>0).sort((a,b)=>b.total-a.total).slice(0,5)
  , [solicitudes])

  const metricasCliente = useMemo(() =>
    CLIENTES.map(c => {
      const todas = solicitudes.filter(s=>s.cliente===c)
      const comp  = todas.filter(s=>s.estado==='completada')
      const ts    = comp.map(s=>(new Date(s.updatedAt).getTime()-new Date(s.createdAt).getTime())/3600000)
      return { cliente:c, total:todas.length, completadas:comp.length, promedioHoras: ts.length>0 ? ts.reduce((a,b)=>a+b,0)/ts.length : null }
    }).filter(m=>m.total>0).sort((a,b)=>b.total-a.total)
  , [solicitudes])

  const filtered = useMemo(() => solicitudes.filter(s =>
    (filtroCliente==='todos'||s.cliente===filtroCliente) && (filtroEstado==='todos'||s.estado===filtroEstado)
  ), [solicitudes, filtroCliente, filtroEstado])

  // ── PDF ───────────────────────────────────────────────────────
  function generarPDF() {
    const desde = pdfDesde ? new Date(pdfDesde) : null
    const hasta = pdfHasta ? new Date(pdfHasta+'T23:59:59') : null
    const data  = solicitudes.filter(s => {
      const f = new Date(s.createdAt)
      if (desde && f<desde) return false; if (hasta && f>hasta) return false
      if (pdfCliente!=='todos' && s.cliente!==pdfCliente) return false; return true
    })
    const rows  = data.map(s => {
      const est  = ESTADOS.find(e=>e.value===s.estado)?.label??s.estado
      const urg  = URGENCIAS.find(u=>u.value===s.urgencia)?.label??s.urgencia
      const fecha = new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})
      return `<tr><td>${fecha}</td><td>${s.cliente}</td><td>${s.tipo}</td><td>${urg.replace(/[🟢🟡🔴]/g,'').trim()}</td><td>${est}</td><td style="max-width:260px">${s.descripcion}</td><td>${s.nota??'—'}</td></tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Relevvo</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px}h1{font-size:17px;margin-bottom:4px}p{color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse}th{background:#5E00A8;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#f9f7ff}</style></head><body><h1>Solicitudes — Relevvo Studio</h1><p>Cliente: <strong>${pdfCliente==='todos'?'Todos':pdfCliente}</strong> | Total: <strong>${data.length}</strong></p><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Urgencia</th><th>Estado</th><th>Descripción</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('','_blank'); win?.document.write(html); win?.document.close()
  }

  const STATS = [
    { label:'Total',       value:solicitudes.length,       color:'#c084fc', bg:'rgba(192,132,252,0.12)' },
    { label:'Pendientes',  value:counts['pendiente']??0,   color:'#E91E8C', bg:'rgba(233,30,140,0.12)' },
    { label:'En proceso',  value:counts['en_proceso']??0,  color:'#818cf8', bg:'rgba(129,140,248,0.12)' },
    { label:'Completadas', value:counts['completada']??0,  color:'#34d399', bg:'rgba(52,211,153,0.12)' },
  ]

  const NAV = [
    { id:'dash',     icon:'⬡', label:'Dashboard' },
    { id:'lista',    icon:'◈', label:'Solicitudes' },
    { id:'metricas', icon:'◎', label:'Métricas' },
    { id:'pdf',      icon:'↓', label:'PDF' },
  ] as const

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at 20% 0%,rgba(94,0,168,0.25) 0%,transparent 60%), radial-gradient(ellipse at 80% 100%,rgba(233,30,140,0.15) 0%,transparent 60%), #06000F' }}>

      {/* ── TOP BAR ── */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 28px', borderBottom:'1px solid rgba(255,255,255,0.07)', backdropFilter:'blur(20px)', position:'sticky', top:0, zIndex:50, background:'rgba(6,0,15,0.7)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:24 }}>
          <img src="/logo.png" alt="Relevvo" style={{ height:28, objectFit:'contain' }}/>
          <nav style={{ display:'flex', gap:4 }}>
            {NAV.map(n => (
              <button key={n.id} onClick={()=>setActiveNav(n.id as any)} style={{
                padding:'7px 14px', borderRadius:10, fontSize:13, border:'none', cursor:'pointer', transition:'.2s',
                background: activeNav===n.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeNav===n.id ? '#fff' : 'rgba(255,255,255,0.4)',
                fontWeight: activeNav===n.id ? 600 : 400,
              }}>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {notifPerm !== 'granted' && (
            <button onClick={()=>Notification.requestPermission().then(p=>setNotifPerm(p))} style={{ fontSize:12, padding:'6px 12px', borderRadius:10, background:'rgba(94,0,168,0.2)', color:'#a78bfa', border:'1px solid rgba(94,0,168,0.35)', cursor:'pointer' }}>🔔 Alertas</button>
          )}
          {nuevas > 0 && (
            <button onClick={()=>setNuevas(0)} style={{ fontSize:12, padding:'6px 12px', borderRadius:10, background:'rgba(233,30,140,0.15)', color:'#E91E8C', border:'1px solid rgba(233,30,140,0.3)', cursor:'pointer' }}>{nuevas} nueva{nuevas>1?'s':''} ✦</button>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,#5E00A8,#E91E8C)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>R</div>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>Relevvo Studio</span>
            <button onClick={()=>signOut({callbackUrl:'/admin/login'})} style={{ fontSize:11, color:'rgba(255,255,255,0.3)', background:'none', border:'none', cursor:'pointer', marginLeft:4 }}>Salir</button>
          </div>
        </div>
      </header>

      <div style={{ padding:'28px 28px 40px', maxWidth:1280, margin:'0 auto' }}>

        {/* ── DASHBOARD (bento) ── */}
        {activeNav === 'dash' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gridAutoRows:'auto', gap:16 }}>

            {/* Stat cards */}
            {STATS.map((s,i) => (
              <GlassCard key={s.label} style={{ gridColumn:`span 3`, padding:'20px 24px', background:s.bg, borderColor:`${s.color}22` }}>
                <p style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.2em', color:'rgba(255,255,255,0.4)', marginBottom:10 }}>{s.label}</p>
                <p style={{ fontSize:36, fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</p>
              </GlassCard>
            ))}

            {/* Chart — actividad 7 días */}
            <GlassCard style={{ gridColumn:'span 8', padding:'22px 24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:3 }}>Actividad reciente</p>
                  <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>Solicitudes por día — últimos 7 días</p>
                </div>
                <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'rgba(233,30,140,0.15)', color:'#E91E8C', border:'1px solid rgba(233,30,140,0.3)' }}>
                  {solicitudes.length} total
                </span>
              </div>
              <div style={{ height:120 }}>
                <LineChart data={chartData}/>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                {chartData.map(d => (
                  <span key={d.label} style={{ fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'center', flex:1 }}>{d.label}</span>
                ))}
              </div>
            </GlassCard>

            {/* Top clientes */}
            <GlassCard style={{ gridColumn:'span 4', padding:'22px 24px' }}>
              <p style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:4 }}>Top clientes</p>
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginBottom:16 }}>Por número de solicitudes</p>
              {topClientes.length === 0 ? (
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>Sin datos aún.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {topClientes.map((m,i) => (
                    <div key={m.cliente}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{m.cliente}</span>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{m.total}</span>
                      </div>
                      <div style={{ height:4, borderRadius:99, background:'rgba(255,255,255,0.07)' }}>
                        <div style={{ height:4, borderRadius:99, width:`${(m.total/(topClientes[0].total||1))*100}%`, background:'linear-gradient(90deg,#5E00A8,#E91E8C)' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Recientes */}
            <GlassCard style={{ gridColumn:'span 12', padding:'22px 24px' }}>
              <p style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:16 }}>Solicitudes recientes</p>
              {solicitudes.length === 0 ? (
                <p style={{ fontSize:13, color:'rgba(255,255,255,0.2)', textAlign:'center', padding:'24px 0' }}>No hay solicitudes aún.</p>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                  {solicitudes.slice(0,6).map(s => {
                    const est = estadoInfo(s.estado)
                    return (
                      <div key={s.id} style={{ borderRadius:14, padding:'14px 16px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(94,0,168,0.25)', color:'#c084fc', border:'1px solid rgba(94,0,168,0.35)', fontWeight:600 }}>{s.cliente}</span>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:`${est.color}18`, color:est.color, border:`1px solid ${est.color}30` }}>{est.label}</span>
                        </div>
                        <p style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:500, marginBottom:4 }}>{s.tipo}</p>
                        <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{s.descripcion}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* ── LISTA ── */}
        {activeNav === 'lista' && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
              <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} className="input" style={{ width:'auto' }}>
                <option value="todos">Todos los clientes</option>
                {CLIENTES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="input" style={{ width:'auto' }}>
                <option value="todos">Todos los estados</option>
                {ESTADOS.map(e=><option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginLeft:'auto' }}>{filtered.length} solicitud{filtered.length!==1?'es':''}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(s => {
                const est = estadoInfo(s.estado); const urg = URGENCIAS.find(u=>u.value===s.urgencia); const isEditing = editId===s.id
                return (
                  <GlassCard key={s.id} style={{ padding:'18px 22px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(94,0,168,0.25)', color:'#c084fc', border:'1px solid rgba(94,0,168,0.35)', fontWeight:600 }}>{s.cliente}</span>
                        <span style={{ fontSize:13, color:'#fff', fontWeight:500 }}>{s.tipo}</span>
                        {urg && <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>{urg.label}</span>}
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>{new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                        <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:`${est.color}18`, color:est.color, border:`1px solid ${est.color}30` }}>{est.label}</span>
                        <button onClick={()=>isEditing?setEditId(null):openEdit(s)} style={{ fontSize:12, padding:'4px 10px', borderRadius:8, background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.5)', border:'none', cursor:'pointer' }}>{isEditing?'Cancelar':'Editar'}</button>
                      </div>
                    </div>
                    <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{s.descripcion}</p>
                    {s.nota && !isEditing && <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.07)' }}><p style={{ fontSize:11, color:'#a78bfa', fontWeight:600, marginBottom:4 }}>Nota interna:</p><p style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>{s.nota}</p></div>}
                    {isEditing && (
                      <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', flexDirection:'column', gap:12 }}>
                        <div>
                          <label className="label">Estado</label>
                          <select value={editEstado} onChange={e=>setEditEstado(e.target.value)} className="input">
                            {ESTADOS.map(e=><option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Nota para el cliente</label>
                          <textarea value={editNota} onChange={e=>setEditNota(e.target.value)} rows={2} className="input resize-none" placeholder="Ej: Listo para el jueves…"/>
                        </div>
                        <button onClick={saveEdit} disabled={saving} className="btn-primary" style={{ alignSelf:'flex-start', padding:'8px 24px', fontSize:13 }}>{saving?'Guardando…':'Guardar cambios'}</button>
                      </div>
                    )}
                  </GlassCard>
                )
              })}
            </div>
          </div>
        )}

        {/* ── MÉTRICAS ── */}
        {activeNav === 'metricas' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
            <GlassCard style={{ padding:'24px' }}>
              <p style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:4 }}>Solicitudes por cliente</p>
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginBottom:20 }}>Ranking total acumulado</p>
              {metricasCliente.length===0 ? <p style={{ fontSize:13, color:'rgba(255,255,255,0.2)' }}>Sin datos aún.</p> :
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {metricasCliente.map(m => (
                    <div key={m.cliente}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{m.cliente}</span>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{m.total} · {m.completadas} ✓</span>
                      </div>
                      <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.07)' }}>
                        <div style={{ height:5, borderRadius:99, width:`${(m.total/(metricasCliente[0].total||1))*100}%`, background:'linear-gradient(90deg,#5E00A8,#E91E8C)' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </GlassCard>
            <GlassCard style={{ padding:'24px' }}>
              <p style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:4 }}>Tiempo de resolución</p>
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginBottom:20 }}>Promedio por cliente (solicitudes completadas)</p>
              {metricasCliente.filter(m=>m.promedioHoras!==null).length===0 ? <p style={{ fontSize:13, color:'rgba(255,255,255,0.2)' }}>Sin completadas aún.</p> :
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                  {metricasCliente.filter(m=>m.promedioHoras!==null).map(m => {
                    const h=m.promedioHoras!; const t=h<1?`${Math.round(h*60)} min`:h<24?`${h.toFixed(1)} h`:`${(h/24).toFixed(1)} días`
                    return (
                      <div key={m.cliente} style={{ borderRadius:14, textAlign:'center', padding:'18px 12px', background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.15)' }}>
                        <p style={{ fontSize:22, fontWeight:700, color:'#a78bfa' }}>{t}</p>
                        <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{m.cliente}</p>
                      </div>
                    )
                  })}
                </div>
              }
            </GlassCard>
          </div>
        )}

        {/* ── PDF ── */}
        {activeNav === 'pdf' && (
          <div style={{ maxWidth:440 }}>
            <GlassCard style={{ padding:'28px' }}>
              <p style={{ fontSize:16, fontWeight:600, color:'#fff', marginBottom:4 }}>Exportar reporte</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginBottom:24 }}>Filtra y genera un PDF con las solicitudes</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div><label className="label">Desde</label><input type="date" value={pdfDesde} onChange={e=>setPdfDesde(e.target.value)} className="input"/></div>
                <div><label className="label">Hasta</label><input type="date" value={pdfHasta} onChange={e=>setPdfHasta(e.target.value)} className="input"/></div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label className="label">Cliente</label>
                <select value={pdfCliente} onChange={e=>setPdfCliente(e.target.value)} className="input">
                  <option value="todos">Todos los clientes</option>
                  {CLIENTES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={generarPDF} className="btn-primary" style={{ width:'100%', fontSize:14 }}>↓ Generar PDF</button>
            </GlassCard>
          </div>
        )}

      </div>
    </div>
  )
}
