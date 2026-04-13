'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { ESTADOS, CLIENTES, URGENCIAS, TIPOS, PERFILES, EQUIPO } from '@/lib/constants'

type Adjunto = { url: string; name: string }
type Solicitud = {
  id: number; cliente: string; tipo: string; urgencia: string
  descripcion: string; estado: string; nota: string | null
  perfil: string | null; asignado: string | null; adjuntos: Adjunto[]; createdAt: string; updatedAt: string
}

// ── Design tokens ──────────────────────────────────────────────
const T = {
  bg:       '#131313',
  sidebar:  '#1C1B1B',
  card:     'rgba(42,42,42,0.6)',
  cardHigh: '#2A2A2A',
  primary:  '#D2BBFF',
  primaryC: '#7C3AED',
  secondary:'#41E575',
  tertiary: '#FFB0CD',
  surface:  '#201F1F',
  onSurf:   '#E5E2E1',
  muted:    '#6B7280',
  border:   'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.08)',
}

// ── Glass panel ────────────────────────────────────────────────
function Glass({ children, style = {}, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: T.card,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Icon (Material Symbols) ────────────────────────────────────
function Icon({ name, filled = false, size = 20 }: { name: string; filled?: boolean; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: size,
      fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      lineHeight: 1,
      userSelect: 'none',
    }}>{name}</span>
  )
}

// ── Bar chart ──────────────────────────────────────────────────
function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:'100%', width:'100%' }}>
      {data.map((d, i) => {
        const pct = (d.count / max) * 100
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height:'100%', cursor:'default' }}>
            <div
              title={`${d.count} solicitud${d.count !== 1 ? 'es' : ''}`}
              style={{
                width:'100%',
                height: pct < 4 && d.count > 0 ? '4%' : `${pct}%`,
                minHeight: d.count > 0 ? 6 : 2,
                background: 'linear-gradient(to top, rgba(255,176,205,0.12), rgba(255,176,205,0.4))',
                borderRadius: '4px 4px 0 0',
                transition: 'height .4s ease',
              }}
            />
            <span style={{ fontSize:9, color:'#4B5563', textAlign:'center', marginTop:6, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>
              {d.label.slice(0, 3)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ estado }: { estado: string }) {
  const info = ESTADOS.find(s => s.value === estado) ?? ESTADOS[0]
  const c = info.color
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:999,
      fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em',
      background:`${c}15`, color:c, border:`1px solid ${c}30`,
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:c, display:'inline-block' }}/>
      {info.label}
    </span>
  )
}

export default function AdminPage() {
  const [solicitudes, setSolicitudes]     = useState<Solicitud[]>([])
  const [filtroCliente, setFiltroCliente] = useState('todos')
  const [filtroEstado, setFiltroEstado]   = useState('todos')
  const [filtroPerfil, setFiltroPerfil]   = useState('todos')
  const [editId, setEditId]               = useState<number | null>(null)
  const [editEstado, setEditEstado]       = useState('')
  const [editNota, setEditNota]           = useState('')
  const [editPerfil, setEditPerfil]       = useState('')
  const [editAsignado, setEditAsignado]   = useState('')
  const [saving, setSaving]               = useState(false)
  const [lastPoll, setLastPoll]           = useState(new Date().toISOString())
  const [nuevas, setNuevas]               = useState(0)
  const [notifPerm, setNotifPerm]         = useState<NotificationPermission>('default')
  const [activeNav, setActiveNav]         = useState<'dash'|'lista'|'metricas'|'pdf'|'clientes'|'equipo'>('dash')
  const [pdfDesde, setPdfDesde]           = useState('')
  const [pdfHasta, setPdfHasta]           = useState('')
  const [pdfCliente, setPdfCliente]       = useState('todos')
  const [search, setSearch]               = useState('')
  const [clientePins, setClientePins]     = useState<{cliente:string;pin:string;source:string}[]>([])
  const [pinVisible, setPinVisible]       = useState<Record<string,boolean>>({})
  const [editPin, setEditPin]             = useState<Record<string,string>>({})
  const [editingPin, setEditingPin]       = useState<string|null>(null)
  const [savingPin, setSavingPin]         = useState(false)
  const [isMobile, setIsMobile]           = useState(false)
  const [showModal, setShowModal]         = useState(false)
  const [integrantes, setIntegrantes]     = useState<{id:number;nombre:string}[]>([])
  const [nuevoMiembro, setNuevoMiembro]   = useState('')
  const [addingMiembro, setAddingMiembro] = useState(false)
  const [editMiembroId, setEditMiembroId] = useState<number|null>(null)
  const [editMiembroNombre, setEditMiembroNombre] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [mCliente, setMCliente]           = useState('')
  const [mTipo, setMTipo]                 = useState('')
  const [mUrgencia, setMUrgencia]         = useState('')
  const [mDesc, setMDesc]                 = useState('')
  const [mSending, setMSending]           = useState(false)
  const [mError, setMError]               = useState('')

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/solicitudes')
    if (res.ok) setSolicitudes(await res.json())
  }, [])

  const fetchIntegrantes = useCallback(async () => {
    const res = await fetch('/api/admin/equipo')
    if (res.ok) setIntegrantes(await res.json())
  }, [])

  useEffect(() => { fetchAll(); fetchIntegrantes() }, [fetchAll, fetchIntegrantes])
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

  function openEdit(s: Solicitud) { setEditId(s.id); setEditEstado(s.estado); setEditNota(s.nota ?? ''); setEditPerfil(s.perfil ?? ''); setEditAsignado(s.asignado ?? '') }
  async function saveEdit() {
    if (!editId) return; setSaving(true)
    const res = await fetch(`/api/solicitudes/${editId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:editEstado,nota:editNota,perfil:editPerfil||null,asignado:editAsignado||null}) })
    setSaving(false); setEditId(null); if (res.ok) fetchAll()
  }

  // ── Derived data ───────────────────────────────────────────
  const counts = useMemo(() => ESTADOS.reduce((acc, e) => { acc[e.value] = solicitudes.filter(s => s.estado === e.value).length; return acc }, {} as Record<string,number>), [solicitudes])

  const chartData = useMemo(() => Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i))
    const key = d.toISOString().slice(0,10)
    return { label: d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'}), count: solicitudes.filter(s => s.createdAt.slice(0,10)===key).length }
  }), [solicitudes])

  const topClientes = useMemo(() =>
    CLIENTES.map(c => ({ cliente:c, total:solicitudes.filter(s=>s.cliente===c).length }))
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
    (filtroCliente==='todos'||s.cliente===filtroCliente) &&
    (filtroEstado==='todos'||s.estado===filtroEstado) &&
    (filtroPerfil==='todos'||s.perfil===filtroPerfil) &&
    (search===''||s.cliente.toLowerCase().includes(search.toLowerCase())||s.tipo.toLowerCase().includes(search.toLowerCase())||s.descripcion.toLowerCase().includes(search.toLowerCase()))
  ), [solicitudes, filtroCliente, filtroEstado, filtroPerfil, search])

  // ── Clientes / PINs ───────────────────────────────────────
  const fetchClientePins = useCallback(async () => {
    const res = await fetch('/api/admin/clientes')
    if (res.ok) setClientePins(await res.json())
  }, [])

  useEffect(() => { if (activeNav === 'clientes') fetchClientePins() }, [activeNav, fetchClientePins])

  async function guardarPin(cliente: string) {
    const nuevo = editPin[cliente]
    if (!nuevo || !/^\d{4}$/.test(nuevo)) return
    setSavingPin(true)
    const res = await fetch(`/api/admin/clientes/${encodeURIComponent(cliente)}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pin: nuevo }),
    })
    setSavingPin(false)
    if (res.ok) { setEditingPin(null); fetchClientePins() }
  }

  // ── Admin crear solicitud ──────────────────────────────────
  async function crearSolicitud() {
    setMError('')
    if (!mCliente || !mTipo || !mUrgencia || !mDesc.trim()) { setMError('Completa todos los campos.'); return }
    setMSending(true)
    const res = await fetch('/api/admin/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente: mCliente, tipo: mTipo, urgencia: mUrgencia, descripcion: mDesc }),
    })
    setMSending(false)
    if (res.ok) {
      setShowModal(false); setMCliente(''); setMTipo(''); setMUrgencia(''); setMDesc(''); setMError('')
      fetchAll()
    } else {
      const data = await res.json()
      setMError(data.error ?? 'Error al crear.')
    }
  }

  // ── PDF ────────────────────────────────────────────────────
  function generarPDF() {
    const desde = pdfDesde ? new Date(pdfDesde) : null
    const hasta = pdfHasta ? new Date(pdfHasta+'T23:59:59') : null
    const data  = solicitudes.filter(s => {
      const f = new Date(s.createdAt)
      if (desde && f<desde) return false; if (hasta && f>hasta) return false
      if (pdfCliente!=='todos' && s.cliente!==pdfCliente) return false; return true
    })
    const rows = data.map(s => {
      const est   = ESTADOS.find(e=>e.value===s.estado)?.label ?? s.estado
      const urg   = URGENCIAS.find(u=>u.value===s.urgencia)?.label ?? s.urgencia
      const fecha = new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})
      return `<tr><td>${fecha}</td><td>${s.cliente}</td><td>${s.tipo}</td><td>${urg.replace(/[🟢🟡🔴]/g,'').trim()}</td><td>${est}</td><td style="max-width:260px">${s.descripcion}</td><td>${s.nota??'—'}</td></tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Relevvo</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px}h1{font-size:17px;margin-bottom:4px}p{color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse}th{background:#7C3AED;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#f5f0ff}</style></head><body><h1>Solicitudes — Relevvo Studio</h1><p>Cliente: <strong>${pdfCliente==='todos'?'Todos':pdfCliente}</strong> | Total: <strong>${data.length}</strong></p><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Urgencia</th><th>Estado</th><th>Descripción</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('','_blank'); win?.document.write(html); win?.document.close()
  }

  // ── Stat card data ─────────────────────────────────────────
  const STATS = [
    { label:'Total',       value:solicitudes.length,       icon:'folder_shared', color:T.primaryC,  badge:'+100%', badgeBg:'rgba(124,58,237,0.15)' },
    { label:'Pendientes',  value:counts['pendiente']??0,   icon:'pending_actions', color:'#FFB0CD', badge:'Stable', badgeBg:'rgba(255,176,205,0.1)' },
    { label:'En proceso',  value:counts['en_proceso']??0,  icon:'sync',          color:'#60A5FA',   badge:'Active', badgeBg:'rgba(96,165,250,0.1)' },
    { label:'Completadas', value:counts['completada']??0,  icon:'check_circle',  color:T.secondary, badge:'Success', badgeBg:'rgba(65,229,117,0.1)' },
  ]

  const NAV = [
    { id:'dash',     icon:'dashboard',   label:'Dashboard' },
    { id:'lista',    icon:'list_alt',    label:'Solicitudes' },
    { id:'metricas', icon:'bar_chart',   label:'Métricas' },
    { id:'pdf',      icon:'description', label:'Reportes' },
    { id:'clientes', icon:'group',       label:'Clientes' },
    { id:'equipo',   icon:'groups',      label:'Equipo' },
  ] as const

  const inputStyle: React.CSSProperties = {
    background: T.surface, border:'none', borderRadius:12, padding:'8px 14px',
    fontSize:13, color:T.onSurf, outline:'none', width:'100%',
  }
  const labelStyle: React.CSSProperties = {
    fontSize:11, color:T.muted, fontWeight:600, textTransform:'uppercase',
    letterSpacing:'.1em', display:'block', marginBottom:6,
  }

  return (
    <>
      {/* Material Symbols font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"/>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"/>

      <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'Inter', system-ui, sans-serif", color:T.onSurf, display:'flex' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width:256, flexShrink:0, height:'100vh', position:'sticky', top:0,
          background:T.sidebar, display: isMobile ? 'none' : 'flex', flexDirection:'column', padding:'0 12px 20px',
          overflowY:'auto',
        }}>
          {/* Logo */}
          <div style={{ padding:'28px 12px 24px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:40, height:40, borderRadius:12, flexShrink:0,
              background:'linear-gradient(135deg, #7C3AED, #D2BBFF)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 20px rgba(124,58,237,0.4)',
            }}>
              <img src="/logo.png" alt="R" style={{ width:26, height:26, objectFit:'contain', filter:'brightness(10)' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }}/>
            </div>
            <div>
              <p style={{ fontSize:16, fontWeight:900, color:'#fff', lineHeight:1, letterSpacing:'-.03em' }}>Relevvo</p>
              <p style={{ fontSize:11, color:T.muted, fontWeight:500, marginTop:2 }}>Studio Portal</p>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
            {NAV.map(n => {
              const active = activeNav === n.id
              return (
                <button key={n.id} onClick={() => setActiveNav(n.id as any)} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'11px 16px', borderRadius:14, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:500, textAlign:'left', transition:'all .2s',
                  background: active ? 'linear-gradient(135deg, #7C3AED, #D2BBFF)' : 'transparent',
                  color: active ? '#fff' : T.muted,
                  boxShadow: active ? '0 0 20px rgba(124,58,237,0.3)' : 'none',
                }}>
                  <Icon name={n.icon} filled={active}/>
                  {n.label}
                </button>
              )
            })}
          </nav>

          {/* Bottom */}
          <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:16, display:'flex', flexDirection:'column', gap:2 }}>
            {notifPerm !== 'granted' && (
              <button onClick={() => Notification.requestPermission().then(p => setNotifPerm(p))} style={{
                display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14,
                border:'none', cursor:'pointer', fontSize:13, color:T.muted, background:'transparent',
                fontWeight:500, textAlign:'left',
              }}>
                <Icon name="notifications"/> Activar alertas
              </button>
            )}
            <button onClick={() => signOut({callbackUrl:'/admin/login'})} style={{
              display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14,
              border:'none', cursor:'pointer', fontSize:13, color:T.muted, background:'transparent',
              fontWeight:500,
            }}>
              <Icon name="logout"/> Salir
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* Top header */}
          <header style={{
            position:'sticky', top:0, zIndex:40,
            background:'rgba(19,19,19,0.85)', backdropFilter:'blur(20px)',
            WebkitBackdropFilter:'blur(20px)',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding: isMobile ? '12px 16px' : '14px 32px', borderBottom:`1px solid ${T.border}`,
          }}>
            {/* Search */}
            <div style={{ position:'relative', maxWidth:380, width:'100%', display: isMobile ? 'none' : 'block' }}>
              <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted, display:'flex' }}>
                <Icon name="search" size={18}/>
              </span>
              <input
                type="text" placeholder="Buscar solicitudes…"
                value={search} onChange={e => { setSearch(e.target.value); if (activeNav!=='lista') setActiveNav('lista') }}
                style={{ ...inputStyle, paddingLeft:38, paddingRight:14 }}
              />
            </div>

            {/* Right side */}
            <div style={{ display:'flex', alignItems:'center', gap:20 }}>
              {/* Notifications */}
              <button
                onClick={() => setNuevas(0)}
                style={{ position:'relative', background:'none', border:'none', cursor:'pointer', color: nuevas>0 ? T.tertiary : T.muted, display:'flex', padding:4 }}
              >
                <Icon name="notifications" size={22}/>
                {nuevas > 0 && (
                  <span style={{
                    position:'absolute', top:2, right:2, width:8, height:8,
                    background:T.tertiary, borderRadius:'50%',
                    border:`2px solid ${T.bg}`,
                  }}/>
                )}
              </button>

              {/* Divider */}
              <div style={{ width:1, height:32, background:T.borderMd }}/>

              {/* User */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#fff', lineHeight:1, marginBottom:2 }}>Relevvo Studio</p>
                  <p style={{ fontSize:11, color:T.primary, fontWeight:500 }}>Administrator</p>
                </div>
                <div style={{
                  width:38, height:38, borderRadius:'50%',
                  background:'linear-gradient(135deg,#7C3AED,#D2BBFF)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:14, fontWeight:800, color:'#fff',
                  border:`2px solid #7C3AED`,
                  boxShadow:'0 0 12px rgba(124,58,237,0.35)',
                }}>R</div>
              </div>
            </div>
          </header>

          {/* Content */}
          <div style={{ flex:1, padding: isMobile ? '20px 16px 90px' : '32px', overflowY:'auto' }}>

            {/* ── DASHBOARD ── */}
            {activeNav === 'dash' && (
              <div style={{ display:'flex', flexDirection:'column', gap:28, maxWidth:1200 }}>

                {/* Hero */}
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16 }}>
                  <div>
                    <h2 style={{ fontSize:36, fontWeight:900, color:'#fff', letterSpacing:'-.04em', marginBottom:6, lineHeight:1 }}>
                      Hola, Relevvo Studio
                    </h2>
                    <p style={{ fontSize:15, color:'rgba(229,226,225,0.6)', fontWeight:500 }}>
                      Tu centro de control creativo.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowModal(true)}
                    style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'14px 24px', borderRadius:14, border:'none', cursor:'pointer',
                      background:'linear-gradient(135deg, #7C3AED, #D2BBFF)',
                      color:'#fff', fontWeight:700, fontSize:14,
                      boxShadow:'0 8px 30px rgba(124,58,237,0.3)',
                      flexShrink:0,
                    }}
                  >
                    <Icon name="add_circle" size={18}/>
                    Nueva solicitud
                  </button>
                </div>

                {/* Stat cards */}
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:12 }}>
                  {STATS.map(s => (
                    <Glass key={s.label} style={{ padding:24, position:'relative', overflow:'hidden' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                        <div style={{ padding:10, borderRadius:12, background:`${s.color}20`, color:s.color, display:'flex' }}>
                          <Icon name={s.icon} filled size={22}/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:800, color:s.color, padding:'3px 8px', borderRadius:99, background:s.badgeBg }}>{s.badge}</span>
                      </div>
                      <p style={{ fontSize:13, color:T.muted, fontWeight:500, marginBottom:4 }}>{s.label}</p>
                      <p style={{ fontSize:32, fontWeight:900, color:'#fff', lineHeight:1 }}>{s.value}</p>
                      {/* Ambient glow */}
                      <div style={{ position:'absolute', bottom:-24, right:-24, width:80, height:80, background:`${s.color}08`, borderRadius:'50%', filter:'blur(24px)' }}/>
                    </Glass>
                  ))}
                </div>

                {/* Chart + Top Clients */}
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:16 }}>
                  {/* Bar chart */}
                  <Glass style={{ padding:28, display:'flex', flexDirection:'column', height:340 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
                      <div>
                        <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em', marginBottom:4 }}>Actividad reciente</h3>
                        <p style={{ fontSize:12, color:T.muted }}>Solicitudes por día — últimos 7 días</p>
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:99, background:'rgba(255,176,205,0.12)', color:T.tertiary }}>
                        {solicitudes.length} total
                      </span>
                    </div>
                    <div style={{ flex:1, minHeight:0 }}>
                      <BarChart data={chartData}/>
                    </div>
                  </Glass>

                  {/* Top clients */}
                  <Glass style={{ padding:28, display:'flex', flexDirection:'column', height:340 }}>
                    <div style={{ marginBottom:20 }}>
                      <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em', marginBottom:4 }}>Top clientes</h3>
                      <p style={{ fontSize:12, color:T.muted }}>Por volumen de solicitudes</p>
                    </div>
                    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', gap:16 }}>
                      {topClientes.length === 0 ? (
                        <p style={{ fontSize:13, color:T.muted, textAlign:'center', marginTop:24 }}>Sin datos aún.</p>
                      ) : topClientes.map((m, i) => (
                        <div key={m.cliente} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', opacity: 1 - i * 0.12 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <div style={{
                              width:38, height:38, borderRadius:'50%', flexShrink:0,
                              background: T.cardHigh,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:14, fontWeight:700, color:'#fff',
                            }}>{m.cliente[0]}</div>
                            <div>
                              <p style={{ fontSize:13, fontWeight:700, color:'#fff', lineHeight:1, marginBottom:2 }}>{m.cliente}</p>
                              <p style={{ fontSize:11, color:T.muted }}>cliente</p>
                            </div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <p style={{ fontSize:14, fontWeight:900, color:T.secondary, lineHeight:1, marginBottom:2 }}>{m.total}</p>
                            <p style={{ fontSize:9, color:'#374151', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em' }}>REQ</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Glass>
                </div>

                {/* Recent table */}
                <Glass style={{ overflow:'hidden' }}>
                  <div style={{
                    padding:'20px 28px', borderBottom:`1px solid ${T.border}`,
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    background:'rgba(255,255,255,0.03)',
                  }}>
                    <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em' }}>Solicitudes recientes</h3>
                    <button onClick={() => setActiveNav('lista')} style={{ fontSize:13, color:T.primary, fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>Ver todas →</button>
                  </div>
                  {solicitudes.length === 0 ? (
                    <p style={{ fontSize:13, color:T.muted, textAlign:'center', padding:'32px 0' }}>No hay solicitudes aún.</p>
                  ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                          {['ID','Cliente','Descripción','Estado','Fecha','Asignado',''].map(h => (
                            <th key={h} style={{ padding:'12px 20px', textAlign:'left', fontSize:10, fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:'.12em', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {solicitudes.slice(0,6).map(s => (
                          <tr key={s.id} style={{ borderTop:`1px solid ${T.border}`, transition:'background .15s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
                          >
                            <td style={{ padding:'16px 20px' }}>
                              <span style={{ fontSize:12, fontWeight:700, color:T.primary }}>#{String(s.id).padStart(4,'0')}</span>
                            </td>
                            <td style={{ padding:'16px 20px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:30, height:30, borderRadius:8, background:T.cardHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>{s.cliente[0]}</div>
                                <span style={{ fontSize:13, fontWeight:500, color:'#fff' }}>{s.cliente}</span>
                              </div>
                            </td>
                            <td style={{ padding:'16px 20px', maxWidth:280 }}>
                              <p style={{ fontSize:12, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.tipo} — {s.descripcion}</p>
                            </td>
                            <td style={{ padding:'16px 20px' }}>
                              <StatusBadge estado={s.estado}/>
                            </td>
                            <td style={{ padding:'16px 20px' }}>
                              <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>
                                {new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
                              </span>
                            </td>
                            <td style={{ padding:'8px 20px' }}>
                              <select
                                value={s.asignado ?? ''}
                                onChange={async e => {
                                  const asignado = e.target.value || null
                                  await fetch(`/api/solicitudes/${s.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ estado:s.estado, nota:s.nota, perfil:s.perfil, asignado }) })
                                  fetchAll()
                                }}
                                style={{ ...inputStyle, fontSize:11, padding:'4px 8px', width:110 }}
                              >
                                <option value="">Sin asignar</option>
                                {integrantes.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                              </select>
                            </td>
                            <td style={{ padding:'16px 20px', textAlign:'right' }}>
                              <button onClick={() => { setEditId(s.id); setEditEstado(s.estado); setEditNota(s.nota??''); setEditPerfil(s.perfil??''); setEditAsignado(s.asignado??''); setActiveNav('lista') }}
                                style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:4 }}>
                                <Icon name="more_vert" size={18}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Glass>
              </div>
            )}

            {/* ── LISTA ── */}
            {activeNav === 'lista' && (
              <div style={{ maxWidth:900 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Solicitudes</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Gestiona y actualiza el estado de cada solicitud.</p>
                </div>

                {/* Filters */}
                <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
                  <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                    <option value="todos">Todos los clientes</option>
                    {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                    <option value="todos">Todos los estados</option>
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  <select value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                    <option value="todos">Todos los perfiles</option>
                    {PERFILES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span style={{ fontSize:12, color:T.muted, marginLeft:'auto' }}>{filtered.length} solicitud{filtered.length!==1?'es':''}</span>
                </div>

                {/* Cards */}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {filtered.map(s => {
                    const urg = URGENCIAS.find(u => u.value === s.urgencia)
                    const isEditing = editId === s.id
                    return (
                      <Glass key={s.id} style={{ padding:'20px 24px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                            <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, background:'rgba(124,58,237,0.2)', color:T.primary, fontWeight:700 }}>{s.cliente}</span>
                            <span style={{ fontSize:14, color:'#fff', fontWeight:600 }}>{s.tipo}</span>
                            {urg && <span style={{ fontSize:12, color:T.muted }}>{urg.label}</span>}
                            <span style={{ fontSize:11, color:'#374151' }}>{new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                          </div>
                          <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                            {s.perfil && (
                              <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', background:'rgba(65,229,117,0.1)', color:T.secondary }}>
                                {s.perfil}
                              </span>
                            )}
                            {s.asignado && (
                              <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, fontWeight:700, background:'rgba(210,187,255,0.12)', color:T.primary }}>
                                👤 {s.asignado}
                              </span>
                            )}
                            <StatusBadge estado={s.estado}/>
                            <button onClick={() => isEditing ? setEditId(null) : openEdit(s)} style={{
                              fontSize:12, padding:'4px 12px', borderRadius:8, border:'none', cursor:'pointer',
                              background:'rgba(255,255,255,0.07)', color:T.muted, fontWeight:500,
                            }}>{isEditing?'Cancelar':'Editar'}</button>
                          </div>
                        </div>
                        <p style={{ fontSize:13, color:'rgba(229,226,225,0.5)', lineHeight:1.65 }}>{s.descripcion}</p>
                        {s.adjuntos?.length > 0 && !isEditing && (
                          <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6 }}>
                            {s.adjuntos.map((a, i) => (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                                display:'inline-flex', alignItems:'center', gap:6,
                                fontSize:11, padding:'4px 10px', borderRadius:8,
                                background:'rgba(124,58,237,0.12)', color:T.primary,
                                textDecoration:'none', fontWeight:500,
                              }}>
                                <Icon name="attach_file" size={13}/>{a.name}
                              </a>
                            ))}
                          </div>
                        )}
                        {s.nota && !isEditing && (
                          <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
                            <p style={{ fontSize:11, color:T.primary, fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:'.08em' }}>Nota interna</p>
                            <p style={{ fontSize:13, color:'rgba(229,226,225,0.45)' }}>{s.nota}</p>
                          </div>
                        )}
                        {isEditing && (
                          <div style={{ marginTop:18, paddingTop:18, borderTop:`1px solid ${T.border}`, display:'flex', flexDirection:'column', gap:14 }}>
                            <div>
                              <label style={labelStyle}>Perfil de desarrollo</label>
                              <select value={editPerfil} onChange={e => setEditPerfil(e.target.value)} style={inputStyle}>
                                <option value="">Sin asignar</option>
                                {PERFILES.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Asignar a</label>
                              <select value={editAsignado} onChange={e => setEditAsignado(e.target.value)} style={inputStyle}>
                                <option value="">Sin asignar</option>
                                {integrantes.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Estado</label>
                              <select value={editEstado} onChange={e => setEditEstado(e.target.value)} style={inputStyle}>
                                {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Nota para el cliente</label>
                              <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2}
                                placeholder="Ej: Listo para el jueves…" style={{ ...inputStyle, resize:'none', fontFamily:'inherit' }}/>
                            </div>
                            <button onClick={saveEdit} disabled={saving} style={{
                              alignSelf:'flex-start', padding:'10px 24px', borderRadius:12, border:'none', cursor:saving?'wait':'pointer',
                              background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:13,
                              opacity: saving ? .7 : 1,
                            }}>{saving?'Guardando…':'Guardar cambios'}</button>
                          </div>
                        )}
                      </Glass>
                    )
                  })}
                  {filtered.length === 0 && (
                    <p style={{ fontSize:14, color:T.muted, textAlign:'center', padding:'40px 0' }}>No hay solicitudes con estos filtros.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── MÉTRICAS ── */}
            {activeNav === 'metricas' && (
              <div style={{ maxWidth:900 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Métricas</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Rendimiento por cliente y tiempos de resolución.</p>
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap:16 }}>
                  <Glass style={{ padding:28 }}>
                    <h3 style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:4 }}>Solicitudes por cliente</h3>
                    <p style={{ fontSize:12, color:T.muted, marginBottom:20 }}>Ranking total acumulado</p>
                    {metricasCliente.length === 0 ? <p style={{ fontSize:13, color:T.muted }}>Sin datos aún.</p> :
                      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                        {metricasCliente.map(m => (
                          <div key={m.cliente}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                              <span style={{ fontSize:13, color:T.onSurf, fontWeight:500 }}>{m.cliente}</span>
                              <span style={{ fontSize:12, color:T.muted }}>{m.total} · {m.completadas} ✓</span>
                            </div>
                            <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.06)' }}>
                              <div style={{ height:5, borderRadius:99, width:`${(m.total/(metricasCliente[0].total||1))*100}%`, background:'linear-gradient(90deg,#7C3AED,#D2BBFF)', transition:'width .5s ease' }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    }
                  </Glass>
                  <Glass style={{ padding:28 }}>
                    <h3 style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:4 }}>Tiempo de resolución</h3>
                    <p style={{ fontSize:12, color:T.muted, marginBottom:20 }}>Promedio por cliente (completadas)</p>
                    {metricasCliente.filter(m=>m.promedioHoras!==null).length === 0 ? <p style={{ fontSize:13, color:T.muted }}>Sin completadas aún.</p> :
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                        {metricasCliente.filter(m=>m.promedioHoras!==null).map(m => {
                          const h=m.promedioHoras!; const t=h<1?`${Math.round(h*60)} min`:h<24?`${h.toFixed(1)} h`:`${(h/24).toFixed(1)} días`
                          return (
                            <div key={m.cliente} style={{ borderRadius:14, textAlign:'center', padding:'20px 12px', background:'rgba(124,58,237,0.08)', border:`1px solid rgba(124,58,237,0.15)` }}>
                              <p style={{ fontSize:24, fontWeight:900, color:T.primary, letterSpacing:'-.03em' }}>{t}</p>
                              <p style={{ fontSize:11, color:T.muted, marginTop:5 }}>{m.cliente}</p>
                            </div>
                          )
                        })}
                      </div>
                    }
                  </Glass>
                </div>
              </div>
            )}

            {/* ── CLIENTES / PINs ── */}
            {activeNav === 'clientes' && (
              <div style={{ maxWidth:640 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Clientes</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Visualiza y cambia el PIN de acceso de cada cliente.</p>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {clientePins.map(({ cliente, pin, source }) => {
                    const isEditing = editingPin === cliente
                    const visible   = pinVisible[cliente]
                    return (
                      <Glass key={cliente} style={{ padding:'18px 24px', display:'flex', alignItems:'center', gap:16 }}>
                        {/* Avatar */}
                        <div style={{ width:42, height:42, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#7C3AED22,#7C3AED44)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:T.primary }}>
                          {cliente[0]}
                        </div>

                        {/* Info */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:3 }}>{cliente}</p>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            {isEditing ? (
                              <input
                                type="text" inputMode="numeric" maxLength={4}
                                value={editPin[cliente] ?? ''}
                                onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setEditPin(prev => ({...prev,[cliente]:e.target.value})) }}
                                placeholder="Nuevo PIN"
                                autoFocus
                                style={{ width:100, background:T.surface, border:`1.5px solid #7C3AED`, borderRadius:8, padding:'5px 10px', fontSize:14, color:'#fff', outline:'none', letterSpacing:'.15em', fontFamily:'monospace' }}
                              />
                            ) : (
                              <span style={{ fontSize:14, color:T.muted, fontFamily:'monospace', letterSpacing:'.2em' }}>
                                {visible ? pin : '••••'}
                              </span>
                            )}
                            {!isEditing && (
                              <button onClick={() => setPinVisible(p => ({...p,[cliente]:!p[cliente]}))}
                                style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:2 }}>
                                <Icon name={visible ? 'visibility_off' : 'visibility'} size={16}/>
                              </button>
                            )}
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', background: source==='db' ? 'rgba(65,229,117,0.1)' : 'rgba(124,58,237,0.1)', color: source==='db' ? T.secondary : T.primary }}>
                              {source === 'db' ? 'personalizado' : 'por defecto'}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => guardarPin(cliente)} disabled={savingPin || (editPin[cliente]?.length ?? 0) < 4}
                                style={{ padding:'7px 14px', borderRadius:9, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:12, opacity: (editPin[cliente]?.length ?? 0) < 4 ? .5 : 1 }}>
                                {savingPin ? '…' : 'Guardar'}
                              </button>
                              <button onClick={() => setEditingPin(null)}
                                style={{ padding:'7px 12px', borderRadius:9, border:'none', cursor:'pointer', background:T.surface, color:T.muted, fontSize:12 }}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { setEditingPin(cliente); setEditPin(p => ({...p,[cliente]:''})) }}
                              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, border:'none', cursor:'pointer', background:T.surface, color:T.muted, fontSize:12, fontWeight:500 }}>
                              <Icon name="edit" size={14}/> Cambiar PIN
                            </button>
                          )}
                        </div>
                      </Glass>
                    )
                  })}
                  {clientePins.length === 0 && (
                    <p style={{ fontSize:13, color:T.muted, textAlign:'center', padding:'32px 0' }}>Cargando clientes…</p>
                  )}
                </div>
              </div>
            )}

            {/* ── EQUIPO ── */}
            {activeNav === 'equipo' && (
              <div style={{ maxWidth:560 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Equipo</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Gestiona los integrantes que pueden ser asignados a solicitudes.</p>
                </div>

                {/* Add member */}
                <Glass style={{ padding:24, marginBottom:20 }}>
                  <label style={labelStyle}>Agregar integrante</label>
                  <div style={{ display:'flex', gap:10 }}>
                    <input
                      value={nuevoMiembro}
                      onChange={e => setNuevoMiembro(e.target.value)}
                      onKeyDown={async e => { if (e.key==='Enter') { e.preventDefault(); if (!nuevoMiembro.trim()) return; setAddingMiembro(true); await fetch('/api/admin/equipo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:nuevoMiembro.trim()})}); setNuevoMiembro(''); await fetchIntegrantes(); setAddingMiembro(false) } }}
                      placeholder="Nombre del integrante…"
                      style={{ ...inputStyle, flex:1 }}
                    />
                    <button
                      disabled={addingMiembro || !nuevoMiembro.trim()}
                      onClick={async () => {
                        if (!nuevoMiembro.trim()) return
                        setAddingMiembro(true)
                        await fetch('/api/admin/equipo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nombre:nuevoMiembro.trim() }) })
                        setNuevoMiembro('')
                        await fetchIntegrantes()
                        setAddingMiembro(false)
                      }}
                      style={{ padding:'10px 20px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:13, opacity:addingMiembro?0.6:1 }}
                    >
                      {addingMiembro ? '…' : 'Agregar'}
                    </button>
                  </div>
                </Glass>

                {/* Member list */}
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {integrantes.length === 0 && (
                    <p style={{ fontSize:13, color:T.muted, textAlign:'center', padding:'32px 0' }}>No hay integrantes aún. Agrega el primero.</p>
                  )}
                  {integrantes.map(m => (
                    <Glass key={m.id} style={{ padding:'14px 20px', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:'rgba(124,58,237,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:T.primary, flexShrink:0 }}>
                        {m.nombre[0].toUpperCase()}
                      </div>
                      {editMiembroId === m.id ? (
                        <>
                          <input
                            value={editMiembroNombre}
                            onChange={e => setEditMiembroNombre(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') {
                                await fetch(`/api/admin/equipo/${m.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nombre:editMiembroNombre.trim() }) })
                                setEditMiembroId(null); fetchIntegrantes()
                              }
                              if (e.key === 'Escape') setEditMiembroId(null)
                            }}
                            style={{ ...inputStyle, flex:1, fontSize:13 }}
                            autoFocus
                          />
                          <button onClick={async () => { await fetch(`/api/admin/equipo/${m.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nombre:editMiembroNombre.trim() }) }); setEditMiembroId(null); fetchIntegrantes() }}
                            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(65,229,117,0.15)', color:T.secondary, fontWeight:700, fontSize:12 }}>
                            Guardar
                          </button>
                          <button onClick={() => setEditMiembroId(null)}
                            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.05)', color:T.muted, fontWeight:700, fontSize:12 }}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex:1, fontSize:14, fontWeight:600, color:'#fff' }}>{m.nombre}</span>
                          <button onClick={() => { setEditMiembroId(m.id); setEditMiembroNombre(m.nombre) }}
                            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.05)', color:T.muted, fontWeight:700, fontSize:12 }}>
                            Renombrar
                          </button>
                          <button onClick={async () => { await fetch(`/api/admin/equipo/${m.id}`, { method:'DELETE' }); fetchIntegrantes() }}
                            style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,80,80,0.1)', color:'#F87171', fontWeight:700, fontSize:12 }}>
                            Eliminar
                          </button>
                        </>
                      )}
                    </Glass>
                  ))}
                </div>
              </div>
            )}

            {/* ── PDF ── */}
            {activeNav === 'pdf' && (
              <div style={{ maxWidth:480 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Reportes</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Genera un PDF con las solicitudes filtradas.</p>
                </div>
                <Glass style={{ padding:28 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div><label style={labelStyle}>Desde</label><input type="date" value={pdfDesde} onChange={e=>setPdfDesde(e.target.value)} style={inputStyle}/></div>
                    <div><label style={labelStyle}>Hasta</label><input type="date" value={pdfHasta} onChange={e=>setPdfHasta(e.target.value)} style={inputStyle}/></div>
                  </div>
                  <div style={{ marginBottom:24 }}>
                    <label style={labelStyle}>Cliente</label>
                    <select value={pdfCliente} onChange={e=>setPdfCliente(e.target.value)} style={inputStyle}>
                      <option value="todos">Todos los clientes</option>
                      {CLIENTES.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button onClick={generarPDF} style={{
                    width:'100%', padding:'14px', borderRadius:14, border:'none', cursor:'pointer',
                    background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff',
                    fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    boxShadow:'0 8px 30px rgba(124,58,237,0.3)',
                  }}>
                    <Icon name="download" size={18}/> Generar PDF
                  </button>
                </Glass>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <nav style={{
          position:'fixed', bottom:0, left:0, right:0, height:68,
          background:T.sidebar, borderTop:`1px solid ${T.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-around',
          zIndex:50, paddingBottom:'env(safe-area-inset-bottom)',
        }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setActiveNav(n.id as any)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              padding:'6px 12px', borderRadius:10, background:'none', border:'none', cursor:'pointer',
            }}>
              <Icon name={n.icon} filled={activeNav===n.id} size={22}/>
              <span style={{ fontSize:9, fontWeight:700, color: activeNav===n.id ? T.primary : T.muted, letterSpacing:'.03em', textTransform:'uppercase' }}>{n.label.slice(0,6)}</span>
            </button>
          ))}
          <button onClick={() => signOut({callbackUrl:'/admin/login'})} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            padding:'6px 12px', borderRadius:10, background:'none', border:'none', cursor:'pointer',
          }}>
            <Icon name="logout" size={22}/>
            <span style={{ fontSize:9, fontWeight:700, color:T.muted, letterSpacing:'.03em', textTransform:'uppercase' }}>Salir</span>
          </button>
        </nav>
      )}

      {/* ── MODAL Nueva Solicitud ── */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{
            position:'fixed', inset:0, zIndex:200,
            background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:24,
          }}
        >
          <Glass style={{ width:'100%', maxWidth:480, padding:32, position:'relative' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <h3 style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-.03em', marginBottom:3 }}>Nueva solicitud</h3>
                <p style={{ fontSize:12, color:T.muted }}>Crea una tarea en nombre de un cliente</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:4 }}>
                <Icon name="close" size={22}/>
              </button>
            </div>

            {/* Form */}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Cliente */}
              <div>
                <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Cliente</label>
                <select value={mCliente} onChange={e => setMCliente(e.target.value)}
                  style={{ width:'100%', background:T.surface, border:'none', borderRadius:12, padding:'12px 14px', fontSize:14, color: mCliente ? T.onSurf : T.muted, outline:'none', appearance:'none' as any }}>
                  <option value="">Selecciona cliente…</option>
                  {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Tipo */}
              <div>
                <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Tipo de solicitud</label>
                <select value={mTipo} onChange={e => setMTipo(e.target.value)}
                  style={{ width:'100%', background:T.surface, border:'none', borderRadius:12, padding:'12px 14px', fontSize:14, color: mTipo ? T.onSurf : T.muted, outline:'none', appearance:'none' as any }}>
                  <option value="">Selecciona tipo…</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Urgencia */}
              <div>
                <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Prioridad</label>
                <div style={{ display:'flex', gap:8 }}>
                  {URGENCIAS.map(u => (
                    <button key={u.value} onClick={() => setMUrgencia(u.value)} style={{
                      flex:1, padding:'10px 8px', borderRadius:10, border:'none', cursor:'pointer',
                      fontSize:12, fontWeight:600, transition:'all .15s',
                      background: mUrgencia === u.value ? `${ESTADOS.find(e=>e.value==='pendiente')?.color ?? '#7C3AED'}20` : T.surface,
                      color: mUrgencia === u.value ? '#fff' : T.muted,
                      outline: mUrgencia === u.value ? '1.5px solid rgba(124,58,237,0.5)' : 'none',
                    }}>
                      {u.label.split('—')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Descripción</label>
                <textarea
                  value={mDesc} onChange={e => setMDesc(e.target.value)} rows={4}
                  placeholder="Describe la tarea con el mayor detalle posible…"
                  style={{ width:'100%', background:T.surface, border:'none', borderRadius:12, padding:'12px 14px', fontSize:14, color:T.onSurf, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box' as any }}
                />
              </div>

              {mError && <p style={{ fontSize:12, color:T.tertiary }}>{mError}</p>}

              <button onClick={crearSolicitud} disabled={mSending} style={{
                padding:'14px', borderRadius:12, border:'none', cursor: mSending ? 'wait' : 'pointer',
                background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff',
                fontWeight:700, fontSize:14, opacity: mSending ? .7 : 1,
                boxShadow:'0 6px 24px rgba(124,58,237,0.3)',
              }}>
                {mSending ? 'Creando…' : 'Crear solicitud'}
              </button>
            </div>
          </Glass>
        </div>
      )}
    </>
  )
}
