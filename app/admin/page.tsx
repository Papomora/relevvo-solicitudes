'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import SeguimientoPanel from './_SeguimientoPanel'
import FinanzasPanel from './_finanzas/_FinanzasPanel'
import { ESTADOS, CLIENTES, URGENCIAS, TIPOS, PERFILES, EQUIPO, PRESUPUESTO_CLIENTES, COSTO_TIPO } from '@/lib/constants'

type Adjunto = { url: string; name: string }
type ProspectoItem = {
  id: number; phone: string; nombre: string | null; estado: string
  entregado: boolean; leido: boolean
  enviadoAt: string | null; respondioAt: string | null; completadoAt: string | null
  followUp1At: string | null; followUp2At: string | null
  brief: string | null; createdAt: string
  historial: { role: string; content: string }[]
}
type Solicitud = {
  id: number; cliente: string; tipo: string; urgencia: string
  descripcion: string; estado: string; nota: string | null
  perfil: string | null; asignado: string | null; adjuntos: Adjunto[]
  archivado: boolean; createdAt: string; updatedAt: string
}

// ── Design tokens ──────────────────────────────────────────────
const T = {
  bg:       '#131313',
  sidebar:  '#1C1B1B',
  card:     'rgba(255,255,255,0.04)',
  cardHigh: '#2A2A2A',
  primary:  '#D2BBFF',
  primaryC: '#7C3AED',
  secondary:'#41E575',
  tertiary: '#FFB0CD',
  surface:  '#201F1F',
  onSurf:   '#E5E2E1',
  muted:    '#8B96A2',
  border:   'rgba(255,255,255,0.07)',
  borderMd: 'rgba(255,255,255,0.11)',
}

// ── Glass panel ────────────────────────────────────────────────
function Glass({ children, style = {}, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border }}
      style={{
        background: T.card,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        transition: 'border-color 0.2s ease',
        ...style,
      }}
    >
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

// ── Prospecto helpers ──────────────────────────────────────────
const PROSPECTO_STEPS = [
  { key:'enviado',   label:'Enviado',   check:(p:ProspectoItem)=>!!p.enviadoAt },
  { key:'entregado', label:'Entregado', check:(p:ProspectoItem)=>p.entregado },
  { key:'leido',     label:'Leído',     check:(p:ProspectoItem)=>p.leido },
  { key:'respondio', label:'Respondió', check:(p:ProspectoItem)=>!!p.respondioAt },
  { key:'brief',     label:'Brief ✓',   check:(p:ProspectoItem)=>!!p.completadoAt },
]
function prospectoStepsDone(p:ProspectoItem){ return PROSPECTO_STEPS.filter(s=>s.check(p)).length }
function fmtProspectoDate(iso:string|null){
  if(!iso) return null
  const d=new Date(iso)
  return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ estado }: { estado: string }) {
  const info = ESTADOS.find(s => s.value === estado) ?? ESTADOS[0]
  const c = info.color
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5, flexShrink:0, whiteSpace:'nowrap',
      padding:'3px 10px', borderRadius:999,
      fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em',
      background:`${c}15`, color:c, border:`1px solid ${c}30`,
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:c, display:'inline-block', flexShrink:0 }}/>
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
  const [editEstado, setEditEstado]           = useState('')
  const [editNota, setEditNota]               = useState('')
  const [editPerfil, setEditPerfil]           = useState('')
  const [editAsignado, setEditAsignado]       = useState('')
  const [editCreatedAt, setEditCreatedAt]     = useState('')
  const [editTipo, setEditTipo]               = useState('')
  const [editUrgencia, setEditUrgencia]       = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editCliente, setEditCliente]         = useState('')
  const [saving, setSaving]                   = useState(false)
  const [lastPoll, setLastPoll]           = useState(new Date().toISOString())
  const [nuevas, setNuevas]               = useState(0)
  const [notifPerm, setNotifPerm]         = useState<NotificationPermission>('default')
  const [activeNav, setActiveNav]         = useState<'dash'|'lista'|'metricas'|'pdf'|'clientes'|'equipo'|'prospectos'|'seguimiento'|'marca90'|'finanzas'>('dash')
  const [pdfDesde, setPdfDesde]           = useState('')
  const [pdfHasta, setPdfHasta]           = useState('')
  const [pdfCliente, setPdfCliente]       = useState('todos')
  const [search, setSearch]               = useState('')
  const [clientePins, setClientePins]     = useState<{cliente:string;pin:string;source:string;presupuesto:number|null;demo:boolean}[]>([])
  const [pinVisible, setPinVisible]       = useState<Record<string,boolean>>({})
  const [editPin, setEditPin]             = useState<Record<string,string>>({})
  const [editingPin, setEditingPin]         = useState<string|null>(null)
  const [savingPin, setSavingPin]           = useState(false)

  // ── Seguimiento ──────────────────────────────────────────────
  const [semanas,       setSemanas]       = useState<any[]>([])
  const [semActual,     setSemActual]     = useState<any>(null)
  const [rolActivo,     setRolActivo]     = useState<'editora'|'cm'|'director'|'miguel'>('director')
  const [semModal,      setSemModal]      = useState(false)
  const [nuevaSem,      setNuevaSem]      = useState('')
  const [nuevaInicio,   setNuevaInicio]   = useState('')
  const [nuevaFin,      setNuevaFin]      = useState('')
  const [savingSem,     setSavingSem]     = useState(false)
  const [notifSending,  setNotifSending]  = useState(false)
  const patchTimerRef   = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [vistaSegui,    setVistaSegui]   = useState<'tareas'|'tablero'>('tareas')
  const [clienteKanban, setClienteKanban] = useState('Crusso')
  const [newCardText,   setNewCardText]  = useState('')
  const [broadcastMsg,  setBroadcastMsg]  = useState('')
  const [leads90,       setLeads90]       = useState<{id:number;nombre:string;email:string;telefono:string;empresa:string;mensaje:string|null;createdAt:string}[]>([])
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [broadcastResult,  setBroadcastResult]  = useState<{nombre:string;ok:boolean;error?:string}[]>([])
  const [editingPresupuesto, setEditingPresupuesto] = useState<string|null>(null)
  const [editPresupuestoVal, setEditPresupuestoVal] = useState<Record<string,string>>({})
  const [isMobile, setIsMobile]           = useState(false)
  const [showModal, setShowModal]         = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const [integrantes, setIntegrantes]     = useState<{id:number;nombre:string;phone?:string|null;rol?:string|null;password?:string|null}[]>([])
  const [nuevoMiembro, setNuevoMiembro]   = useState('')
  const [nuevoPhone, setNuevoPhone]       = useState('')
  const [addingMiembro, setAddingMiembro] = useState(false)
  const [editMiembroId, setEditMiembroId] = useState<number|null>(null)
  const [editMiembroNombre, setEditMiembroNombre] = useState('')
  const [editMiembroPhone, setEditMiembroPhone]   = useState('')
  const [editMiembroRol, setEditMiembroRol]       = useState('')
  const [demoNombre, setDemoNombre]               = useState('')
  const [demoPin, setDemoPin]                     = useState('')
  const [addingDemo, setAddingDemo]               = useState(false)
  const [demoErr, setDemoErr]                     = useState('')
  const [deletingDemo, setDeletingDemo]           = useState<string|null>(null)
  const [renamingDemo, setRenamingDemo]           = useState<string|null>(null)
  const [renameVal, setRenameVal]                 = useState('')
  const [deletingProspecto, setDeletingProspecto] = useState<number|null>(null)
  const [prospectoPhone, setProspectoPhone]       = useState('')
  const [prospectoNombre, setProspectoNombre]     = useState('')
  const [sendingProspecto, setSendingProspecto]   = useState(false)
  const [prospectoOk, setProspectoOk]             = useState(false)
  const [prospectoErr, setProspectoErr]           = useState('')
  const [expandedProspecto, setExpandedProspecto] = useState<number | null>(null)
  const [reenviadoIds, setReenviadoIds]           = useState<Set<number>>(new Set())
  const [prospectos, setProspectos]               = useState<ProspectoItem[]>([])

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

  const fetchProspectos = useCallback(async () => {
    const res = await fetch('/api/whatsapp/prospecto')
    if (res.ok) setProspectos(await res.json())
  }, [])

  const fetchSeguimiento = useCallback(async () => {
    const res = await fetch('/api/admin/seguimiento')
    if (!res.ok) return
    const data = await res.json()
    setSemanas(data)
    setSemActual((prev: any) => prev ? data.find((s: any) => s.id === prev.id) ?? data[0] ?? null : data[0] ?? null)
  }, [])

  const patchSemana = useCallback((patch: { tareas?: any; notas?: any; tablero?: any }) => {
    if (!semActual) return
    // Optimistic local update
    setSemActual((prev: any) => ({ ...prev, ...patch }))
    // Debounced PATCH
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
    patchTimerRef.current = setTimeout(async () => {
      await fetch(`/api/admin/seguimiento/${semActual.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }, 400)
  }, [semActual])

  useEffect(() => { fetchAll(); fetchIntegrantes(); fetchProspectos() }, [fetchAll, fetchIntegrantes, fetchProspectos])
  useEffect(() => { if (activeNav === 'prospectos') fetchProspectos() }, [activeNav, fetchProspectos])
  useEffect(() => { if (activeNav === 'seguimiento') fetchSeguimiento() }, [activeNav, fetchSeguimiento])
  useEffect(() => {
    if (activeNav === 'marca90') {
      fetch('/api/leads/marca90dias', { headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'relevvo-cron-secret-2026'}` } })
        .then(r => r.json()).then(d => { if (Array.isArray(d)) setLeads90(d) }).catch(() => {})
    }
  }, [activeNav])
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

  const [deletingId, setDeletingId]       = useState<number|null>(null)
  const [archivingId, setArchivingId]     = useState<number|null>(null)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [viewMode, setViewMode]           = useState<'grid'|'list'>('grid')

  function openEdit(s: Solicitud) {
    setEditId(s.id)
    setEditEstado(s.estado)
    setEditNota(s.nota ?? '')
    setEditPerfil(s.perfil ?? '')
    setEditAsignado(s.asignado ?? '')
    setEditTipo(s.tipo)
    setEditUrgencia(s.urgencia)
    setEditDescripcion(s.descripcion)
    setEditCliente(s.cliente)
    // Format for datetime-local input: "YYYY-MM-DDTHH:mm"
    setEditCreatedAt(new Date(s.createdAt).toISOString().slice(0, 16))
  }
  async function deleteSolicitud(id: number) {
    if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    await fetch(`/api/solicitudes/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    fetchAll()
  }
  async function toggleArchivar(s: Solicitud) {
    setArchivingId(s.id)
    await fetch(`/api/solicitudes/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: s.estado, nota: s.nota, perfil: s.perfil, asignado: s.asignado, archivado: !s.archivado }),
    })
    setArchivingId(null)
    fetchAll()
  }
  async function saveEdit() {
    if (!editId) return; setSaving(true)
    const res = await fetch(`/api/solicitudes/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: editEstado, nota: editNota,
        perfil: editPerfil || null, asignado: editAsignado || null,
        createdAt: editCreatedAt || undefined,
        tipo: editTipo || undefined,
        urgencia: editUrgencia || undefined,
        descripcion: editDescripcion || undefined,
        cliente: editCliente || undefined,
      }),
    })
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

  const capacidadClientes = useMemo(() => {
    const now   = new Date()
    const mesY  = now.getFullYear()
    const mesM  = now.getMonth()
    const avgCosto = Object.values(COSTO_TIPO).reduce((a,b)=>a+b,0) / Object.values(COSTO_TIPO).length
    return CLIENTES.map(c => {
      const dbPresu    = clientePins.find(p => p.cliente === c)?.presupuesto
      const presu      = dbPresu ?? PRESUPUESTO_CLIENTES[c] ?? 1_990_000
      const delMes     = solicitudes.filter(s => {
        const d = new Date(s.createdAt)
        return s.cliente===c && d.getFullYear()===mesY && d.getMonth()===mesM
      })
      const usado      = delMes.reduce((acc, s) => acc + (COSTO_TIPO[s.tipo] ?? 100_000), 0)
      const restante   = Math.max(0, presu - usado)
      const pct        = Math.min(100, Math.round((usado / presu) * 100))
      const solicRestantes = Math.floor(restante / avgCosto)
      return { cliente: c, presu, usado, restante, pct, solicRestantes, totalMes: delMes.length }
    }).filter(m => m.totalMes > 0 || m.presu > 0)
  }, [solicitudes, clientePins])

  const metricasCliente = useMemo(() =>
    CLIENTES.map(c => {
      const todas = solicitudes.filter(s=>s.cliente===c)
      const comp  = todas.filter(s=>s.estado==='completada')
      const ts    = comp.map(s=>(new Date(s.updatedAt).getTime()-new Date(s.createdAt).getTime())/3600000)
      return { cliente:c, total:todas.length, completadas:comp.length, promedioHoras: ts.length>0 ? ts.reduce((a,b)=>a+b,0)/ts.length : null }
    }).filter(m=>m.total>0).sort((a,b)=>b.total-a.total)
  , [solicitudes])

  const filtered = useMemo(() => solicitudes.filter(s =>
    s.archivado === verArchivadas &&
    (filtroCliente==='todos'||s.cliente===filtroCliente) &&
    (filtroEstado==='todos'||s.estado===filtroEstado) &&
    (filtroPerfil==='todos'||s.perfil===filtroPerfil) &&
    (search===''||s.cliente.toLowerCase().includes(search.toLowerCase())||s.tipo.toLowerCase().includes(search.toLowerCase())||s.descripcion.toLowerCase().includes(search.toLowerCase()))
  ), [solicitudes, verArchivadas, filtroCliente, filtroEstado, filtroPerfil, search])

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

  async function guardarPresupuesto(cliente: string) {
    const val = editPresupuestoVal[cliente]
    const num = parseInt(val?.replace(/\D/g,'') ?? '')
    if (!num || num < 100_000) return
    const res = await fetch(`/api/admin/clientes/${encodeURIComponent(cliente)}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ presupuesto: num }),
    })
    if (res.ok) { setEditingPresupuesto(null); fetchClientePins() }
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
  const pendientesHoy = solicitudes.filter(s => s.estado==='pendiente' && new Date(s.createdAt).toDateString()===new Date().toDateString()).length
  const STATS = [
    { label:'Total solicitudes', value:solicitudes.length,       icon:'folder_shared',   color:'#A78BFA', grad:'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(167,139,250,0.1))',  badge:'este mes',  badgeBg:'rgba(167,139,250,0.18)', glow:'rgba(124,58,237,0.2)' },
    { label:'Pendientes',        value:counts['pendiente']??0,   icon:'pending_actions', color:'#FDA4AF', grad:'linear-gradient(135deg,rgba(255,176,205,0.2),rgba(251,113,133,0.08))', badge:`+${pendientesHoy} hoy`, badgeBg:'rgba(255,176,205,0.18)', glow:'rgba(255,176,205,0.15)' },
    { label:'En proceso',        value:counts['en_proceso']??0,  icon:'autorenew',       color:'#60A5FA', grad:'linear-gradient(135deg,rgba(96,165,250,0.2),rgba(59,130,246,0.08))',   badge:'activas',   badgeBg:'rgba(96,165,250,0.18)', glow:'rgba(96,165,250,0.15)' },
    { label:'Completadas',       value:counts['completada']??0,  icon:'check_circle',    color:'#4ADE80', grad:'linear-gradient(135deg,rgba(65,229,117,0.2),rgba(34,197,94,0.08))',    badge:`${solicitudes.length>0?Math.round((counts['completada']??0)/solicitudes.length*100):0}% tasa`, badgeBg:'rgba(65,229,117,0.18)', glow:'rgba(65,229,117,0.15)' },
  ]

  const NAV = [
    { id:'dash',     icon:'dashboard',   label:'Dashboard' },
    { id:'lista',    icon:'list_alt',    label:'Solicitudes' },
    { id:'metricas', icon:'bar_chart',   label:'Métricas' },
    { id:'pdf',      icon:'description', label:'Reportes' },
    { id:'clientes', icon:'group',       label:'Clientes' },
    { id:'equipo',       icon:'groups',         label:'Equipo' },
    { id:'prospectos',   icon:'send',           label:'Prospectos' },
    { id:'seguimiento',  icon:'calendar_month', label:'Seguimiento' },
    { id:'marca90',      icon:'storefront',     label:'Marca 90 Días' },
    { id:'finanzas',     icon:'account_balance_wallet', label:'Finanzas' },
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
      <style>{`@keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

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
              <p style={{ fontSize:11, color:T.muted, fontWeight:500, marginTop:2 }}>Studio Portal <span style={{color:'rgba(210,187,255,0.4)',fontSize:9}}>v2.6</span></p>
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
            <a href="/admin/clientes-wa" style={{
              display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14,
              fontSize:13, color:T.muted, background:'transparent', fontWeight:500,
              textDecoration:'none',
            }}>
              <Icon name="phone_iphone"/> Clientes WA
            </a>
            <a href="/admin/meta" style={{
              display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14,
              fontSize:13, color:T.muted, background:'transparent', fontWeight:500,
              textDecoration:'none',
            }}>
              <Icon name="bar_chart"/> Reportes Meta
            </a>
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
            {/* Left: search (desktop) | section title (mobile) */}
            {isMobile ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>R</div>
                <p style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:'-.02em' }}>
                  {NAV.find(n => n.id === activeNav)?.label ?? 'Admin'}
                </p>
              </div>
            ) : (
              <div style={{ position:'relative', maxWidth:380, width:'100%' }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted, display:'flex' }}>
                  <Icon name="search" size={18}/>
                </span>
                <input
                  type="text" placeholder="Buscar solicitudes…"
                  value={search} onChange={e => { setSearch(e.target.value); if (activeNav!=='lista') setActiveNav('lista') }}
                  style={{ ...inputStyle, paddingLeft:38, paddingRight:14 }}
                />
              </div>
            )}

            {/* Right side */}
            <div style={{ display:'flex', alignItems:'center', gap: isMobile ? 8 : 20 }}>
              {/* Mobile: search icon → go to lista */}
              {isMobile && (
                <button
                  onClick={() => setActiveNav('lista')}
                  style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:6, borderRadius:10 }}
                >
                  <Icon name="search" size={22}/>
                </button>
              )}

              {/* Mobile: quick new solicitud */}
              {isMobile && (
                <button
                  onClick={() => setShowModal(true)}
                  style={{ background:'rgba(124,58,237,0.2)', border:'1px solid rgba(124,58,237,0.3)', cursor:'pointer', color:T.primary, display:'flex', padding:6, borderRadius:10 }}
                >
                  <Icon name="add" size={22}/>
                </button>
              )}

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

              {/* Desktop: divider + user */}
              {!isMobile && (
                <>
                  <div style={{ width:1, height:32, background:T.borderMd }}/>
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
                </>
              )}
            </div>
          </header>

          {/* Content */}
          <div style={{ flex:1, padding: isMobile ? '16px 16px 96px' : '32px', overflowY:'auto' }}>

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
                    <div key={s.label} style={{
                      background: s.grad,
                      backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
                      border:`1px solid ${s.color}25`,
                      borderRadius:18, padding:'22px 24px',
                      position:'relative', overflow:'hidden',
                      boxShadow:`0 4px 24px ${s.glow}`,
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
                        <div style={{ width:44, height:44, borderRadius:13, background:`${s.color}20`, border:`1px solid ${s.color}30`, color:s.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Icon name={s.icon} filled size={22}/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:800, color:s.color, padding:'4px 9px', borderRadius:99, background:s.badgeBg, letterSpacing:'.04em' }}>{s.badge}</span>
                      </div>
                      <p style={{ fontSize:12, color:'rgba(229,226,225,0.55)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</p>
                      <p style={{ fontSize:38, fontWeight:900, color:'#fff', lineHeight:1, letterSpacing:'-.03em' }}>{s.value}</p>
                      {/* Ambient glow orb */}
                      <div style={{ position:'absolute', bottom:-30, right:-20, width:100, height:100, background:s.color, borderRadius:'50%', opacity:0.07, filter:'blur(32px)', pointerEvents:'none' }}/>
                    </div>
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
                    <div style={{ marginBottom:16 }}>
                      <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em', marginBottom:4 }}>Top clientes</h3>
                      <p style={{ fontSize:12, color:T.muted }}>Por volumen de solicitudes</p>
                    </div>
                    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', gap:10 }}>
                      {topClientes.length === 0 ? (
                        <p style={{ fontSize:13, color:T.muted, textAlign:'center', marginTop:24 }}>Sin datos aún.</p>
                      ) : (() => {
                        const maxVal = topClientes[0]?.total ?? 1
                        const palette = ['#A78BFA','#60A5FA','#4ADE80','#FDA4AF','#FCD34D']
                        return topClientes.map((m, i) => {
                          const pct = Math.round((m.total / maxVal) * 100)
                          const col = palette[i % palette.length]
                          return (
                            <div key={m.cliente}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <div style={{ width:28, height:28, borderRadius:8, background:`${col}22`, border:`1px solid ${col}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:col, flexShrink:0 }}>{m.cliente[0]}</div>
                                  <p style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{m.cliente}</p>
                                </div>
                                <span style={{ fontSize:13, fontWeight:800, color:col }}>{m.total}</span>
                              </div>
                              <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.06)' }}>
                                <div style={{ height:5, borderRadius:99, width:`${pct}%`, background:col, boxShadow:`0 0 8px ${col}50`, transition:'width .5s ease' }}/>
                              </div>
                            </div>
                          )
                        })
                      })()}
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
                    <div style={{ textAlign:'center', padding:'48px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <div style={{ width:48, height:48, borderRadius:14, background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:T.primary, marginBottom:4 }}>
                        <Icon name="folder_open" size={24} filled/>
                      </div>
                      <p style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.6)' }}>Sin solicitudes aún</p>
                      <button onClick={() => setShowModal(true)} style={{ fontSize:13, color:T.primary, fontWeight:600, background:'none', border:'none', cursor:'pointer', marginTop:2 }}>+ Crear la primera →</button>
                    </div>
                  ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                          {['ID','Cliente','Descripción','Estado','Fecha','Asignado',''].map(h => (
                            <th key={h} style={{ padding:'12px 20px', textAlign:'left', fontSize:10, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.12em', whiteSpace:'nowrap' }}>{h}</th>
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
                <div style={{ marginBottom:24, display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
                  <div>
                    <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>
                      {verArchivadas ? 'Archivo' : 'Solicitudes'}
                    </h2>
                    <p style={{ fontSize:13, color:T.muted }}>
                      {verArchivadas ? 'Solicitudes archivadas — solo lectura.' : 'Gestiona y actualiza el estado de cada solicitud.'}
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {/* Grid / List toggle */}
                    <div style={{ display:'flex', borderRadius:10, overflow:'hidden', border:`1px solid ${T.borderMd}` }}>
                      {(['grid','list'] as const).map(m => (
                        <button key={m} onClick={() => setViewMode(m)} style={{
                          display:'flex', alignItems:'center', justifyContent:'center',
                          width:36, height:34, border:'none', cursor:'pointer',
                          background: viewMode===m ? 'rgba(124,58,237,0.3)' : 'transparent',
                          color: viewMode===m ? T.primary : T.muted,
                          transition:'all .15s',
                        }}>
                          <Icon name={m==='grid' ? 'grid_view' : 'view_agenda'} size={17}/>
                        </button>
                      ))}
                    </div>
                    {/* Archive toggle */}
                    <button
                      onClick={() => { setVerArchivadas(v => !v); setEditId(null) }}
                      style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'9px 18px', borderRadius:12, border:'none', cursor:'pointer',
                        background: verArchivadas ? 'rgba(210,187,255,0.12)' : 'rgba(255,255,255,0.06)',
                        color: verArchivadas ? T.primary : T.muted,
                        fontSize:13, fontWeight:600,
                      }}
                    >
                      <Icon name={verArchivadas ? 'inbox' : 'archive'} size={16}/>
                      {verArchivadas ? 'Ver activas' : 'Ver archivo'}
                      <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(255,255,255,0.08)', color:T.muted, marginLeft:2 }}>
                        {solicitudes.filter(s => s.archivado === !verArchivadas).length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
                  <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                    <option value="todos">Todos los clientes</option>
                    {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                    {clientePins.filter(p => p.demo).map(p => <option key={p.cliente} value={p.cliente}>{p.cliente} (demo)</option>)}
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
                <div style={viewMode==='grid' ? {
                  display:'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(290px, 1fr))',
                  gap:14,
                } : { display:'flex', flexDirection:'column', gap:12 }}>
                  {filtered.map((s, idx) => {
                    const urg = URGENCIAS.find(u => u.value === s.urgencia)
                    const isEditing = editId === s.id

                    /* ── GRID CARD ── */
                    if (viewMode==='grid' && !isEditing) return (
                      <Glass key={s.id} style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:0, cursor:'default', animation:`cardIn 220ms ease-out ${idx * 40}ms both` }}>
                        {/* Top row: ID + estado */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <span style={{ fontSize:10, fontWeight:800, color:T.primary, letterSpacing:'.06em' }}>#{String(s.id).padStart(4,'0')}</span>
                          <StatusBadge estado={s.estado}/>
                        </div>
                        {/* Cliente + tipo */}
                        <div style={{ marginBottom:8 }}>
                          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'rgba(124,58,237,0.18)', color:T.primary, fontWeight:700, marginBottom:6, display:'inline-block' }}>{s.cliente}</span>
                          <p style={{ fontSize:14, fontWeight:700, color:'#fff', lineHeight:1.3, marginTop:4 }}>{s.tipo}</p>
                        </div>
                        {/* Descripción truncada */}
                        <p style={{ fontSize:12, color:'rgba(229,226,225,0.45)', lineHeight:1.6, marginBottom:12,
                          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' as any }}>
                          {s.descripcion}
                        </p>
                        {/* Meta row */}
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                          {urg && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(255,255,255,0.06)', color:T.muted, fontWeight:500 }}>{urg.label.replace(/[🟢🟡🔴]/g,'').trim()}</span>}
                          {s.perfil && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(65,229,117,0.1)', color:T.secondary, fontWeight:700 }}>{s.perfil}</span>}
                          {s.asignado && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(210,187,255,0.1)', color:T.primary, fontWeight:600 }}>👤 {s.asignado}</span>}
                        </div>
                        {/* Date */}
                        <p style={{ fontSize:10, color:T.muted, fontWeight:600, marginBottom:14 }}>
                          {new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
                        </p>
                        {/* Actions footer */}
                        <div style={{ display:'flex', gap:6, borderTop:`1px solid ${T.border}`, paddingTop:12 }}>
                          <button onClick={() => { openEdit(s); setViewMode('list') }} style={{
                            flex:1, padding:'6px 0', borderRadius:8, border:'none', cursor:'pointer',
                            background:'rgba(255,255,255,0.06)', color:T.muted, fontSize:11, fontWeight:600,
                            display:'flex', alignItems:'center', justifyContent:'center', gap:4, transition:'background .15s',
                          }}
                            onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.1)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}
                          >
                            <Icon name="edit" size={13}/> Editar
                          </button>
                          <button onClick={() => toggleArchivar(s)} disabled={archivingId===s.id} style={{
                            flex:1, padding:'6px 0', borderRadius:8, border:'none', cursor:'pointer',
                            background: s.archivado ? 'rgba(65,229,117,0.08)' : 'rgba(210,187,255,0.08)',
                            color: s.archivado ? T.secondary : T.primary, fontSize:11, fontWeight:600,
                            display:'flex', alignItems:'center', justifyContent:'center', gap:4, transition:'background .15s',
                            opacity: archivingId===s.id ? 0.5 : 1,
                          }}>
                            <Icon name={s.archivado ? 'unarchive' : 'archive'} size={13}/>
                            {archivingId===s.id ? '…' : s.archivado ? 'Desarch.' : 'Archivar'}
                          </button>
                          <button onClick={() => deleteSolicitud(s.id)} disabled={deletingId===s.id} style={{
                            width:34, padding:'6px 0', borderRadius:8, border:'none', cursor:'pointer',
                            background:'rgba(248,113,113,0.08)', color:'#F87171', fontSize:11,
                            display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s',
                            opacity: deletingId===s.id ? 0.5 : 1,
                          }}>
                            <Icon name="delete" size={14}/>
                          </button>
                        </div>
                      </Glass>
                    )

                    return (
                      <Glass key={s.id} style={{ padding:'20px 24px', animation:`cardIn 220ms ease-out ${idx * 40}ms both` }}>
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
                            {!isEditing && (
                              <button
                                onClick={() => toggleArchivar(s)}
                                disabled={archivingId===s.id}
                                style={{
                                  display:'flex', alignItems:'center', gap:5,
                                  fontSize:12, padding:'4px 12px', borderRadius:8, border:'none',
                                  cursor: archivingId===s.id ? 'wait' : 'pointer',
                                  background: s.archivado ? 'rgba(65,229,117,0.1)' : 'rgba(210,187,255,0.1)',
                                  color: s.archivado ? T.secondary : T.primary,
                                  fontWeight:500, opacity: archivingId===s.id ? 0.5 : 1,
                                }}
                              >
                                <Icon name={s.archivado ? 'unarchive' : 'archive'} size={13}/>
                                {archivingId===s.id ? '…' : s.archivado ? 'Desarchivar' : 'Archivar'}
                              </button>
                            )}
                            {!isEditing && (
                              <button onClick={() => deleteSolicitud(s.id)} disabled={deletingId===s.id} style={{
                                fontSize:12, padding:'4px 12px', borderRadius:8, border:'none', cursor:deletingId===s.id?'wait':'pointer',
                                background:'rgba(248,113,113,0.1)', color:'#F87171', fontWeight:500, opacity:deletingId===s.id?0.5:1,
                              }}>{deletingId===s.id?'…':'Eliminar'}</button>
                            )}
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
                            {/* ── Content fields ── */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                              <div>
                                <label style={labelStyle}>Tipo</label>
                                <select value={editTipo} onChange={e => setEditTipo(e.target.value)} style={inputStyle}>
                                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={labelStyle}>Urgencia</label>
                                <select value={editUrgencia} onChange={e => setEditUrgencia(e.target.value)} style={inputStyle}>
                                  {URGENCIAS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Descripción</label>
                              <textarea value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)} rows={3}
                                style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit' }}/>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                              <div>
                                <label style={labelStyle}>Cliente</label>
                                <select value={editCliente} onChange={e => setEditCliente(e.target.value)} style={inputStyle}>
                                  {[...CLIENTES, ...clientePins.filter(p=>p.demo).map(p=>p.cliente)].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={labelStyle}>Estado</label>
                                <select value={editEstado} onChange={e => setEditEstado(e.target.value)} style={inputStyle}>
                                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
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
                            </div>
                            <div>
                              <label style={labelStyle}>Fecha de creación</label>
                              <input type="datetime-local" value={editCreatedAt}
                                onChange={e => setEditCreatedAt(e.target.value)}
                                style={{ ...inputStyle, colorScheme:'dark' }}/>
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
                    <div style={{ textAlign:'center', padding:'60px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:12, gridColumn:'1 / -1' }}>
                      <div style={{ width:56, height:56, borderRadius:16, background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:T.primary, marginBottom:4 }}>
                        <Icon name="inbox" size={28} filled/>
                      </div>
                      <p style={{ fontSize:16, fontWeight:700, color:'rgba(255,255,255,0.7)', letterSpacing:'-.01em' }}>Todo está al día ✨</p>
                      <p style={{ fontSize:13, color:T.muted }}>No hay solicitudes con estos filtros.</p>
                    </div>
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
                {/* ── Capacidad por plan ── */}
                <Glass style={{ padding:28, marginBottom:16 }}>
                  <div style={{ marginBottom:20 }}>
                    <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em', marginBottom:4 }}>Capacidad por plan — este mes</h3>
                    <p style={{ fontSize:12, color:T.muted }}>Presupuesto usado vs disponible según tipo de solicitud</p>
                  </div>
                  {capacidadClientes.length === 0 ? (
                    <p style={{ fontSize:13, color:T.muted }}>Sin solicitudes este mes aún.</p>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap:16 }}>
                      {capacidadClientes.map(m => {
                        const barColor = m.pct >= 90 ? '#F87171' : m.pct >= 70 ? '#FCD34D' : T.secondary
                        return (
                          <div key={m.cliente} style={{ background:'rgba(255,255,255,0.03)', borderRadius:14, padding:'18px 20px', border:`1px solid ${T.border}` }}>
                            {/* Header */}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                              <div>
                                <p style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:3 }}>{m.cliente}</p>
                                <p style={{ fontSize:11, color:T.muted }}>
                                  Presupuesto: <span style={{ color:'#fff', fontWeight:600 }}>${m.presu.toLocaleString('es-CO')}</span>/mes
                                </p>
                              </div>
                              <span style={{
                                fontSize:12, fontWeight:800, padding:'4px 10px', borderRadius:99,
                                background: m.pct>=90 ? 'rgba(248,113,113,0.15)' : m.pct>=70 ? 'rgba(252,211,77,0.15)' : 'rgba(65,229,117,0.12)',
                                color: barColor,
                              }}>{m.pct}% usado</span>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height:6, borderRadius:99, background:'rgba(255,255,255,0.08)', marginBottom:12 }}>
                              <div style={{ height:6, borderRadius:99, width:`${m.pct}%`, background: barColor, transition:'width .5s ease' }}/>
                            </div>
                            {/* Stats row */}
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
                              {[
                                { label:'Usado', value:`$${(m.usado/1000).toFixed(0)}k`, color:barColor },
                                { label:'Restante', value:`$${(m.restante/1000).toFixed(0)}k`, color:T.secondary },
                                { label:'Solicitudes mes', value:m.totalMes, color:T.primary },
                              ].map(st => (
                                <div key={st.label} style={{ textAlign:'center', background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'10px 8px' }}>
                                  <p style={{ fontSize:16, fontWeight:900, color:st.color as string, lineHeight:1, marginBottom:4 }}>{st.value}</p>
                                  <p style={{ fontSize:10, color:T.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>{st.label}</p>
                                </div>
                              ))}
                            </div>
                            {/* Capacity forecast */}
                            <div style={{ borderRadius:10, padding:'10px 14px', background: m.solicRestantes > 0 ? 'rgba(65,229,117,0.06)' : 'rgba(248,113,113,0.06)', border:`1px solid ${m.solicRestantes > 0 ? 'rgba(65,229,117,0.15)' : 'rgba(248,113,113,0.15)'}` }}>
                              {m.solicRestantes > 0 ? (
                                <p style={{ fontSize:12, color:T.muted, lineHeight:1.5 }}>
                                  Puede generar aprox. <span style={{ fontWeight:800, color:T.secondary, fontSize:14 }}>~{m.solicRestantes}</span> solicitudes más este mes sin exceder el plan.
                                </p>
                              ) : (
                                <p style={{ fontSize:12, color:'#F87171', fontWeight:600 }}>⚠ Presupuesto mensual agotado o excedido.</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Glass>

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
              <div style={{ maxWidth:780 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Clientes</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Visualiza y cambia el PIN de acceso de cada cliente.</p>
                </div>

                {/* ── Add demo client ── */}
                <Glass style={{ padding:20, marginBottom:20 }}>
                  <p style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.09em', marginBottom:12 }}>Agregar cliente demo</p>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <input
                      value={demoNombre}
                      onChange={e => { setDemoNombre(e.target.value); setDemoErr('') }}
                      placeholder="Nombre del cliente…"
                      style={{ ...inputStyle, flex:'1 1 160px' }}
                    />
                    <input
                      value={demoPin}
                      onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) { setDemoPin(e.target.value); setDemoErr('') } }}
                      placeholder="PIN (4 dígitos)"
                      maxLength={4}
                      inputMode="numeric"
                      style={{ ...inputStyle, width:120, fontFamily:'monospace', letterSpacing:'.15em', flex:'0 0 120px' }}
                    />
                    <button
                      disabled={addingDemo || !demoNombre.trim() || demoPin.length < 4}
                      onClick={async () => {
                        setAddingDemo(true); setDemoErr('')
                        const res = await fetch('/api/admin/clientes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cliente: demoNombre.trim(), pin: demoPin }),
                        })
                        if (res.ok) { setDemoNombre(''); setDemoPin(''); fetchClientePins() }
                        else { const d = await res.json(); setDemoErr(d.error ?? 'Error') }
                        setAddingDemo(false)
                      }}
                      style={{ padding:'10px 20px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:13, opacity: addingDemo || !demoNombre.trim() || demoPin.length < 4 ? 0.5 : 1, whiteSpace:'nowrap' }}
                    >
                      {addingDemo ? '…' : '+ Agregar'}
                    </button>
                  </div>
                  {demoErr && <p style={{ fontSize:12, color:'#f87171', marginTop:8 }}>{demoErr}</p>}
                </Glass>

                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {clientePins.map(({ cliente, pin, source, presupuesto, demo }) => {
                    const isEditing = editingPin === cliente
                    const visible   = pinVisible[cliente]
                    return (
                      <Glass key={cliente} style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:0 }}>
                        {/* ── Top row: avatar + info + PIN action ── */}
                        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                          {/* Avatar */}
                          <div style={{ width:40, height:40, borderRadius:'50%', flexShrink:0, background: demo ? 'linear-gradient(135deg,#FFB0CD22,#FFB0CD44)' : 'linear-gradient(135deg,#7C3AED22,#7C3AED44)', border: `1px solid ${demo ? 'rgba(255,176,205,0.3)' : 'rgba(124,58,237,0.3)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color: demo ? T.tertiary : T.primary }}>
                            {cliente[0]}
                          </div>

                          {/* Info */}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                              <p style={{ fontSize:14, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', margin:0 }}>{cliente}</p>
                              {demo && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:99, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', flexShrink:0, background:'rgba(255,176,205,0.12)', color:T.tertiary, border:'1px solid rgba(255,176,205,0.25)' }}>demo</span>}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
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
                                <span style={{ fontSize:13, color:T.muted, fontFamily:'monospace', letterSpacing:'.2em', flexShrink:0 }}>
                                  {visible ? pin : '••••'}
                                </span>
                              )}
                              {!isEditing && (
                                <button onClick={() => setPinVisible(p => ({...p,[cliente]:!p[cliente]}))}
                                  style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:2, flexShrink:0 }}>
                                  <Icon name={visible ? 'visibility_off' : 'visibility'} size={14}/>
                                </button>
                              )}
                              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:99, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', flexShrink:0, background: source==='db' ? 'rgba(65,229,117,0.1)' : 'rgba(124,58,237,0.1)', color: source==='db' ? T.secondary : T.primary, border: `1px solid ${source==='db' ? 'rgba(65,229,117,0.2)' : 'rgba(124,58,237,0.2)'}` }}>
                                {source === 'db' ? 'personalizado' : 'por defecto'}
                              </span>
                            </div>
                          </div>

                          {/* PIN action */}
                          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                            {isEditing ? (
                              <>
                                <button onClick={() => guardarPin(cliente)} disabled={savingPin || (editPin[cliente]?.length ?? 0) < 4}
                                  style={{ padding:'6px 12px', borderRadius:9, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:12, opacity: (editPin[cliente]?.length ?? 0) < 4 ? .5 : 1 }}>
                                  {savingPin ? '…' : 'Guardar'}
                                </button>
                                <button onClick={() => setEditingPin(null)}
                                  style={{ padding:'6px 10px', borderRadius:9, border:'none', cursor:'pointer', background:T.surface, color:T.muted, fontSize:12 }}>
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingPin(cliente); setEditPin(p => ({...p,[cliente]:''})) }}
                                  style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:9, border:`1px solid ${T.border}`, cursor:'pointer', background:'transparent', color:T.muted, fontSize:12, fontWeight:500 }}>
                                  <Icon name="pin" size={14}/> PIN
                                </button>
                                {demo && renamingDemo === cliente ? (
                                  <>
                                    <input
                                      value={renameVal}
                                      onChange={e => setRenameVal(e.target.value)}
                                      placeholder="Nuevo nombre…"
                                      autoFocus
                                      style={{ ...inputStyle, width:150, fontSize:12, padding:'5px 10px' }}
                                    />
                                    <button
                                      disabled={!renameVal.trim()}
                                      onClick={async () => {
                                        if (!renameVal.trim()) return
                                        await fetch(`/api/admin/clientes/${encodeURIComponent(cliente)}`, {
                                          method:'PATCH', headers:{'Content-Type':'application/json'},
                                          body: JSON.stringify({ nuevoNombre: renameVal.trim() }),
                                        })
                                        setRenamingDemo(null); setRenameVal(''); fetchClientePins()
                                      }}
                                      style={{ padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(65,229,117,0.15)', color:T.secondary, fontSize:12, fontWeight:700 }}>✓</button>
                                    <button onClick={() => { setRenamingDemo(null); setRenameVal('') }}
                                      style={{ padding:'5px 8px', borderRadius:8, border:'none', cursor:'pointer', background:T.surface, color:T.muted, fontSize:12 }}>✕</button>
                                  </>
                                ) : demo ? (
                                  <>
                                    <button
                                      onClick={() => { setRenamingDemo(cliente); setRenameVal(cliente) }}
                                      style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:9, border:`1px solid ${T.border}`, cursor:'pointer', background:'transparent', color:T.muted, fontSize:12, fontWeight:500 }}>
                                      <Icon name="edit" size={14}/>
                                    </button>
                                    <button
                                      disabled={deletingDemo === cliente}
                                      onClick={async () => {
                                        if (!confirm(`¿Eliminar el cliente demo "${cliente}"? Se perderá el acceso.`)) return
                                        setDeletingDemo(cliente)
                                        await fetch(`/api/admin/clientes/${encodeURIComponent(cliente)}`, { method:'DELETE' })
                                        await fetchClientePins()
                                        setDeletingDemo(null)
                                      }}
                                      style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:9, border:'1px solid rgba(248,113,113,0.3)', cursor:'pointer', background:'rgba(248,113,113,0.08)', color:'#f87171', fontSize:12, fontWeight:500, opacity: deletingDemo === cliente ? 0.5 : 1 }}>
                                      <Icon name="delete" size={14}/>
                                    </button>
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Bottom row: presupuesto ── */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
                          <div>
                            <p style={{ fontSize:10, color:T.muted, fontWeight:600, marginBottom:3, textTransform:'uppercase', letterSpacing:'.08em' }}>Presupuesto / mes</p>
                            {editingPresupuesto === cliente ? (
                              <input
                                type="text" inputMode="numeric"
                                value={editPresupuestoVal[cliente] ?? ''}
                                onChange={e => setEditPresupuestoVal(p => ({...p,[cliente]:e.target.value.replace(/\D/g,'')}))}
                                placeholder="Ej: 2000000"
                                autoFocus
                                style={{ width:140, background:T.surface, border:`1.5px solid #7C3AED`, borderRadius:8, padding:'5px 10px', fontSize:13, color:'#fff', outline:'none', fontFamily:'monospace' }}
                              />
                            ) : (
                              <p style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:'-.02em' }}>
                                ${((presupuesto ?? PRESUPUESTO_CLIENTES[cliente] ?? 1_990_000) / 1_000_000).toFixed(presupuesto && presupuesto % 1_000_000 !== 0 ? 1 : 0)} M COP
                              </p>
                            )}
                          </div>
                          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                            {editingPresupuesto === cliente ? (
                              <>
                                <button onClick={() => guardarPresupuesto(cliente)} disabled={(parseInt(editPresupuestoVal[cliente]??'0')||0) < 100_000}
                                  style={{ padding:'6px 12px', borderRadius:9, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:12, opacity:(parseInt(editPresupuestoVal[cliente]??'0')||0)<100_000?.5:1 }}>
                                  Guardar
                                </button>
                                <button onClick={() => setEditingPresupuesto(null)}
                                  style={{ padding:'6px 10px', borderRadius:9, border:'none', cursor:'pointer', background:T.surface, color:T.muted, fontSize:12 }}>
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button onClick={() => { setEditingPresupuesto(cliente); setEditPresupuestoVal(p => ({...p,[cliente]: String(presupuesto ?? PRESUPUESTO_CLIENTES[cliente] ?? 1_990_000)})) }}
                                style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:9, border:`1px solid ${T.border}`, cursor:'pointer', background:'transparent', color:T.muted, fontSize:12, fontWeight:500 }}>
                                <Icon name="edit" size={14}/> Editar
                              </button>
                            )}
                          </div>
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
              <div style={{ maxWidth:600 }}>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Equipo</h2>
                  <p style={{ fontSize:13, color:T.muted }}>Asigna roles para que el bot envíe tareas personalizadas por WhatsApp.</p>
                </div>

                {/* ── Add member form ── */}
                <Glass style={{ padding:20, marginBottom:20 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Agregar integrante</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:10 }}>
                    <input value={nuevoMiembro} onChange={e=>setNuevoMiembro(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter' && nuevoMiembro.trim()) document.getElementById('btn-agregar-miembro')?.click() }}
                      placeholder="Nombre..." style={{ ...inputStyle, fontSize:13 }} />
                    <input value={nuevoPhone} onChange={e=>setNuevoPhone(e.target.value)}
                      placeholder="+573001234567" style={{ ...inputStyle, fontSize:13 }} />
                    <button id="btn-agregar-miembro"
                      disabled={addingMiembro || !nuevoMiembro.trim()}
                      onClick={async () => {
                        if (!nuevoMiembro.trim()) return
                        setAddingMiembro(true)
                        const res = await fetch('/api/admin/equipo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nombre:nuevoMiembro.trim(), phone:nuevoPhone.trim()||null }) })
                        if (res.ok) { setNuevoMiembro(''); setNuevoPhone(''); await fetchIntegrantes() }
                        setAddingMiembro(false)
                      }}
                      style={{ padding:'10px 18px', borderRadius:10, border:'none', cursor:'pointer', background:T.primaryC, color:'#fff', fontWeight:700, fontSize:13, opacity:addingMiembro||!nuevoMiembro.trim()?0.5:1, whiteSpace:'nowrap' }}>
                      {addingMiembro ? '…' : '+ Agregar'}
                    </button>
                  </div>
                </Glass>

                {/* ── Integrante cards ── */}
                {integrantes.length === 0 && (
                  <p style={{ fontSize:13, color:T.muted, textAlign:'center', padding:'40px 0' }}>No hay integrantes. Agrega el primero arriba.</p>
                )}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {integrantes.map(m => {
                    const ROL_MAP: Record<string,{label:string;color:string}> = {
                      director: { label:'Director creativo', color:'#A78BFA' },
                      cm:       { label:'Community Manager', color:'#67E8F9' },
                      editora:  { label:'Editora de video',  color:'#F9A8D4' },
                      miguel:   { label:'Trafficker',        color:'#6EE7B7' },
                    }
                    const rolInfo = m.rol ? ROL_MAP[m.rol] : null

                    return (
                      <Glass key={m.id} style={{ padding:'18px 20px' }}>
                        {/* Top row: avatar + info */}
                        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
                          <div style={{ width:42, height:42, borderRadius:12, background:`${rolInfo?.color ?? T.primaryC}25`, border:`1.5px solid ${rolInfo?.color ?? T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:rolInfo?.color ?? T.primary, flexShrink:0 }}>
                            {m.nombre[0].toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:2 }}>{m.nombre}</div>
                            <div style={{ fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              {m.phone ? `📱 ${m.phone}` : 'Sin teléfono'}
                              {m.password && (
                                <span style={{ fontSize:10, background:'rgba(124,58,237,0.15)', color:T.primary, padding:'1px 8px', borderRadius:8 }}>
                                  🔑 {m.password}
                                </span>
                              )}
                            </div>
                          </div>
                          {rolInfo && (
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:`${rolInfo.color}20`, color:rolInfo.color, border:`1px solid ${rolInfo.color}40`, whiteSpace:'nowrap' }}>
                              {rolInfo.label}
                            </span>
                          )}
                        </div>

                        {/* Bottom row: rol selector + delete */}
                        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                          <select
                            defaultValue={m.rol ?? ''}
                            key={`rol-${m.id}-${m.rol}`}
                            onChange={async e => {
                              const nuevoRol = e.target.value || null
                              // Optimistic update
                              setIntegrantes(prev => prev.map(x => x.id===m.id ? {...x, rol:nuevoRol} : x))
                              await fetch(`/api/admin/equipo/${m.id}`, {
                                method:'PATCH', headers:{'Content-Type':'application/json'},
                                body: JSON.stringify({ nombre:m.nombre, phone:m.phone, rol:nuevoRol }),
                              })
                            }}
                            style={{ ...inputStyle, flex:1, fontSize:12, cursor:'pointer' }}>
                            <option value="">— Asignar rol —</option>
                            <option value="director">Director creativo</option>
                            <option value="cm">Community Manager</option>
                            <option value="editora">Editora de video</option>
                            <option value="miguel">Trafficker (Miguel)</option>
                          </select>
                          <button onClick={async () => { if(!confirm(`¿Eliminar a ${m.nombre}?`)) return; await fetch(`/api/admin/equipo/${m.id}`, { method:'DELETE' }); fetchIntegrantes() }}
                            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)', cursor:'pointer', background:'transparent', color:'#F87171', fontWeight:700, fontSize:12 }}>
                            Eliminar
                          </button>
                        </div>
                      </Glass>
                    )
                  })}
                </div>

                {/* ── Broadcast panel ── */}
                <div style={{ marginTop:28 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:T.primary }}>send</span>
                    <p style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Enviar mensaje al equipo</p>
                    <span style={{ fontSize:11, color:T.muted }}>(todos los integrantes con teléfono)</span>
                  </div>
                  <Glass style={{ padding:20 }}>
                    <textarea
                      value={broadcastMsg}
                      onChange={e=>setBroadcastMsg(e.target.value)}
                      placeholder="Escribe el mensaje aquí... Soporta *negrita* de WhatsApp"
                      rows={4}
                      style={{ ...inputStyle, width:'100%', resize:'vertical', lineHeight:1.55, fontSize:13, fontFamily:'var(--font-inter)', marginBottom:12 }}
                    />
                    <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                      <button
                        disabled={broadcastSending || !broadcastMsg.trim()}
                        onClick={async () => {
                          setBroadcastSending(true)
                          setBroadcastResult([])
                          try {
                            const res = await fetch('/api/admin/equipo/broadcast', {
                              method:'POST',
                              headers:{'Content-Type':'application/json'},
                              body: JSON.stringify({ mensaje: broadcastMsg.trim() }),
                            })
                            const data = await res.json()
                            setBroadcastResult(data.detalle ?? [])
                            if (data.enviados === data.total) setBroadcastMsg('')
                          } catch { setBroadcastResult([{ nombre:'Error de red', ok:false, error:'No se pudo conectar' }]) }
                          setBroadcastSending(false)
                        }}
                        style={{ padding:'10px 24px', borderRadius:10, border:'none', cursor:'pointer', background:T.primaryC, color:'#fff', fontWeight:700, fontSize:13, opacity:broadcastSending||!broadcastMsg.trim()?0.5:1 }}>
                        {broadcastSending ? '📤 Enviando...' : '📤 Enviar a todos'}
                      </button>
                      {broadcastResult.length > 0 && (
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {broadcastResult.map((r,i) => (
                            <span key={i} style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20, background:r.ok?'rgba(65,229,117,0.12)':'rgba(248,113,113,0.12)', color:r.ok?T.secondary:'#F87171', border:`1px solid ${r.ok?'rgba(65,229,117,0.3)':'rgba(248,113,113,0.3)'}` }}>
                              {r.ok?'✓':'✗'} {r.nombre}
                              {!r.ok && r.error ? ` — ${r.error.slice(0,40)}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Glass>
                </div>

              </div>
            )}

            {/* ── PROSPECTOS ── */}
            {activeNav === 'prospectos' && (
                <div style={{ maxWidth:720 }}>
                  <div style={{ marginBottom:24 }}>
                    <h2 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Prospectos</h2>
                    <p style={{ fontSize:13, color:T.muted }}>Envía y rastrea mensajes de prospección por WhatsApp.</p>
                  </div>

                  {/* Send form */}
                  <Glass style={{ padding:24, marginBottom:28 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                      <div>
                        <label style={labelStyle}>Número de WhatsApp</label>
                        <input value={prospectoPhone} onChange={e=>setProspectoPhone(e.target.value)} placeholder="+573001234567" style={inputStyle}/>
                      </div>
                      <div>
                        <label style={labelStyle}>Nombre (opcional)</label>
                        <input value={prospectoNombre} onChange={e=>setProspectoNombre(e.target.value)} placeholder="Ej: El Rincón Vegano" style={inputStyle}/>
                      </div>
                    </div>
                    <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', fontSize:12, color:T.muted, marginBottom:16, lineHeight:1.6 }}>
                      📨 &quot;Hola <em>{prospectoNombre||'amig@'}</em> 👋 Somos <strong style={{color:'#fff'}}>Relevvo Studio</strong>…&quot;
                    </div>
                    {prospectoOk && <p style={{ fontSize:13, color:T.secondary, marginBottom:10 }}>✅ Mensaje enviado correctamente.</p>}
                    {prospectoErr && <p style={{ fontSize:12, color:'#F87171', marginBottom:10, padding:'8px 12px', borderRadius:8, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)' }}>❌ {prospectoErr}</p>}
                    <button
                      disabled={sendingProspecto||!prospectoPhone.trim()}
                      onClick={async()=>{
                        setSendingProspecto(true); setProspectoOk(false); setProspectoErr('')
                        const res = await fetch('/api/whatsapp/prospecto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:prospectoPhone.trim(),nombre:prospectoNombre.trim()})})
                        setSendingProspecto(false)
                        if(res.ok){
                          const data = await res.json()
                          setProspectoOk(true)
                          setProspectoPhone('');setProspectoNombre('');fetchProspectos()
                          if(!data.whatsapp) setProspectoErr('WhatsApp no confirmó envío' + (data.waError ? `: ${data.waError}` : '. Verifica el template en Meta.'))
                        } else {
                          const data = await res.json().catch(()=>({}))
                          setProspectoErr(data.error ?? `Error ${res.status}` + (data.detail ? `: ${data.detail}` : ''))
                        }
                      }}
                      style={{ padding:'10px 24px', borderRadius:10, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', color:'#fff', fontWeight:700, fontSize:13, opacity:(sendingProspecto||!prospectoPhone.trim())?0.5:1 }}
                    >
                      {sendingProspecto?'Enviando…':'📤 Enviar mensaje'}
                    </button>
                  </Glass>

                  {/* Summary row */}
                  {prospectos.length > 0 && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
                      {[
                        { label:'Enviados',   val:prospectos.length,                              color:T.primary },
                        { label:'Entregados', val:prospectos.filter(p=>p.entregado).length,       color:'#60A5FA' },
                        { label:'Respuestas', val:prospectos.filter(p=>p.respondioAt).length,     color:'#FBBF24' },
                        { label:'Briefs',     val:prospectos.filter(p=>p.completadoAt).length,    color:T.secondary },
                      ].map(s=>(
                        <Glass key={s.label} style={{ padding:'14px 16px', textAlign:'center' }}>
                          <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
                          <div style={{ fontSize:11, color:T.muted, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em' }}>{s.label}</div>
                        </Glass>
                      ))}
                    </div>
                  )}

                  {/* Prospect list */}
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {prospectos.length === 0 && (
                      <p style={{ fontSize:13, color:T.muted, textAlign:'center', padding:'40px 0' }}>No hay prospectos aún. Envía el primer mensaje arriba.</p>
                    )}
                    {[...prospectos].sort((a,b)=>new Date(b.enviadoAt??b.createdAt??0).getTime()-new Date(a.enviadoAt??a.createdAt??0).getTime()).map(p=>{
                      const done  = prospectoStepsDone(p)
                      const pct   = Math.round((done/PROSPECTO_STEPS.length)*100)
                      const isComplete = !!p.completadoAt
                      let brief:any = null
                      try { if(p.brief) brief = JSON.parse(p.brief) } catch { brief = null }
                      return (
                        <Glass key={p.id} style={{ padding:'18px 20px' }}>
                          {/* Header row */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ width:36, height:36, borderRadius:10, background: isComplete ? 'rgba(65,229,117,0.15)' : 'rgba(124,58,237,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <Icon name={isComplete?'check_circle':'person'} size={18} filled={isComplete}/>
                              </div>
                              <div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{p.nombre||p.phone}</span>
                                  {/* Nueva respuesta badge */}
                                  {p.respondioAt && !p.completadoAt && (
                                    <span style={{ padding:'2px 7px', borderRadius:999, fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', background:'rgba(96,165,250,0.15)', color:'#60A5FA', border:'1px solid rgba(96,165,250,0.3)' }}>
                                      💬 respondió
                                    </span>
                                  )}
                                </div>
                                {p.nombre && <div style={{ fontSize:11, color:T.muted }}>{p.phone}</div>}
                              </div>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {p.leido && <span style={{ fontSize:10, color:'#60A5FA' }}>👁</span>}
                              <span style={{
                                padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em',
                                background: isComplete ? 'rgba(65,229,117,0.12)' : done===0 ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.12)',
                                color: isComplete ? T.secondary : done===0 ? T.muted : T.primary,
                                border: `1px solid ${isComplete?T.secondary+'30':done===0?T.border:T.primary+'30'}`,
                              }}>
                                {isComplete ? 'Completado' : done===0 ? 'Enviado' : `${pct}%`}
                              </span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ marginBottom:12 }}>
                            <div style={{ display:'flex', gap:3, marginBottom:6 }}>
                              {PROSPECTO_STEPS.map((s,i)=>{
                                const active = s.check(p)
                                const isNext = !active && PROSPECTO_STEPS.slice(0,i).every(prev=>prev.check(p))
                                return (
                                  <div key={s.key} style={{ flex:1, height:4, borderRadius:4,
                                    background: active ? T.secondary : isNext ? 'rgba(210,187,255,0.4)' : 'rgba(255,255,255,0.07)',
                                    transition:'background .3s',
                                  }}/>
                                )
                              })}
                            </div>
                            <div style={{ display:'flex', gap:3 }}>
                              {PROSPECTO_STEPS.map(s=>(
                                <div key={s.key} style={{ flex:1, textAlign:'center', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color: s.check(p) ? T.secondary : T.muted }}>
                                  {s.label}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Timestamps */}
                          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:11, color:T.muted, marginBottom:12 }}>
                            {p.enviadoAt && <span>📤 {fmtProspectoDate(p.enviadoAt)}</span>}
                            {p.respondioAt && <span style={{ color:'#60A5FA' }}>💬 respondió {fmtProspectoDate(p.respondioAt)}</span>}
                            {p.followUp1At && <span>🔔 follow-up 1</span>}
                            {p.followUp2At && <span>🔔 follow-up 2</span>}
                            {p.completadoAt && <span>🎯 brief {fmtProspectoDate(p.completadoAt)}</span>}
                          </div>

                          {/* Brief preview */}
                          {brief && (
                            <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, background:'rgba(65,229,117,0.06)', border:'1px solid rgba(65,229,117,0.15)', fontSize:12, color:T.onSurf, lineHeight:1.7 }}>
                              <strong style={{ color:T.secondary, fontSize:11, textTransform:'uppercase', letterSpacing:'.08em' }}>Brief</strong><br/>
                              🏢 {brief.negocio} · 🏷️ {brief.industria}<br/>
                              📋 {brief.necesidades}<br/>
                              🎯 {brief.objetivo} · 💰 {brief.presupuesto}
                            </div>
                          )}

                          {/* Expanded conversation history */}
                          {expandedProspecto === p.id && Array.isArray(p.historial) && p.historial.length > 0 && (
                            <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, maxHeight:260, overflowY:'auto' }}>
                              <div style={{ fontSize:10, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Conversación</div>
                              {p.historial.map((h, hi) => (
                                <div key={hi} style={{ marginBottom:8, display:'flex', flexDirection:'column', alignItems: h.role==='user' ? 'flex-start' : 'flex-end' }}>
                                  <div style={{
                                    padding:'6px 10px', borderRadius: h.role==='user' ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                                    background: h.role==='user' ? 'rgba(255,255,255,0.06)' : 'rgba(124,58,237,0.15)',
                                    fontSize:12, color:T.onSurf, lineHeight:1.5, maxWidth:'85%',
                                  }}>
                                    {h.content}
                                  </div>
                                  <div style={{ fontSize:9, color:T.muted, marginTop:2, paddingInline:4 }}>
                                    {h.role === 'user' ? '👤 prospecto' : '🤖 relev'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {expandedProspecto === p.id && Array.isArray(p.historial) && p.historial.length === 0 && (
                            <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, fontSize:12, color:T.muted, textAlign:'center' }}>
                              Sin mensajes aún.
                            </div>
                          )}

                          {/* No-entregado warning */}
                          {p.enviadoAt && !p.entregado && !p.respondioAt && (
                            <div style={{ marginBottom:10, padding:'8px 12px', borderRadius:9, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', fontSize:11, color:'#f87171', display:'flex', alignItems:'center', gap:7 }}>
                              <Icon name="warning" size={14}/> Mensaje no entregado — puede que el número sea inválido o no tenga WhatsApp.
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            <button
                              onClick={() => setExpandedProspecto(expandedProspecto === p.id ? null : p.id)}
                              style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:T.onSurf, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                            >
                              <Icon name={expandedProspecto === p.id ? 'expand_less' : 'chat'} size={13}/>
                              {expandedProspecto === p.id ? 'Ocultar' : `Ver conversación${Array.isArray(p.historial) && p.historial.length > 0 ? ` (${p.historial.length})` : ''}`}
                            </button>
                            <button
                              disabled={reenviadoIds.has(p.id)}
                              onClick={async () => {
                                if (reenviadoIds.has(p.id)) return
                                try {
                                  await fetch('/api/whatsapp/prospecto', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ phone: p.phone, nombre: p.nombre || '' }),
                                  })
                                  setReenviadoIds(prev => new Set(Array.from(prev).concat(p.id)))
                                } catch { /* silent */ }
                              }}
                              style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${reenviadoIds.has(p.id) ? T.secondary+'40' : 'rgba(255,176,205,0.3)'}`, background: reenviadoIds.has(p.id) ? 'rgba(65,229,117,0.08)' : 'rgba(255,176,205,0.07)', color: reenviadoIds.has(p.id) ? T.secondary : T.tertiary, fontSize:11, fontWeight:600, cursor: reenviadoIds.has(p.id) ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:5, opacity: reenviadoIds.has(p.id) ? 0.7 : 1 }}
                            >
                              <Icon name={reenviadoIds.has(p.id) ? 'check' : 'send'} size={13}/>
                              {reenviadoIds.has(p.id) ? 'Reenviado' : 'Reenviar info'}
                            </button>
                            {/* Delete / dismiss */}
                            <button
                              disabled={deletingProspecto === p.id}
                              onClick={async () => {
                                setDeletingProspecto(p.id)
                                await fetch('/api/whatsapp/prospecto', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id: p.id }) })
                                setProspectos(prev => prev.filter(x => x.id !== p.id))
                                setDeletingProspecto(null)
                              }}
                              style={{ marginLeft:'auto', padding:'6px 10px', borderRadius:8, border:'1px solid rgba(248,113,113,0.25)', background:'rgba(248,113,113,0.07)', color:'#f87171', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, opacity: deletingProspecto === p.id ? 0.5 : 1 }}
                            >
                              <Icon name="delete" size={13}/>
                              {deletingProspecto === p.id ? '…' : 'Eliminar'}
                            </button>
                          </div>
                        </Glass>
                      )
                    })}
                  </div>
                </div>
            )}

            {/* ── SEGUIMIENTO ── */}
            {activeNav === 'seguimiento' && <SeguimientoPanel />}

            {/* ── FINANZAS ── */}
            {activeNav === 'finanzas' && <FinanzasPanel />}

            {/* ── MARCA 90 DÍAS — LEADS ── */}
            {activeNav === 'marca90' && (
              <div style={{ maxWidth: 760 }}>
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-.03em', marginBottom: 4 }}>
                    Leads — Marca en 90 Días
                  </h2>
                  <p style={{ fontSize: 13, color: T.muted }}>
                    Formularios recibidos desde <strong style={{ color: '#fff' }}>relevvostudio.com/marca90dias</strong>
                  </p>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Leads totales',   val: leads90.length,                                icon: 'group' },
                    { label: 'Esta semana',      val: leads90.filter(l => { const d = new Date(l.createdAt); const now = new Date(); return (now.getTime() - d.getTime()) < 7*24*60*60*1000; }).length, icon: 'calendar_today' },
                    { label: 'Hoy',              val: leads90.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length, icon: 'today' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.primary }}>{s.icon}</span>
                        <span style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Leads list */}
                {leads90.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 12, opacity: .3 }}>inbox</span>
                    <p>No hay leads aún. El formulario está activo en la landing.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {leads90.map(lead => (
                      <div key={lead.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: T.primary, flexShrink: 0 }}>
                                {lead.nombre[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{lead.nombre}</div>
                                <div style={{ fontSize: 11, color: T.muted }}>{lead.empresa}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                              <a href={`mailto:${lead.email}`} style={{ fontSize: 12, color: T.primary, textDecoration: 'none' }}>✉ {lead.email}</a>
                              <a href={`https://wa.me/${lead.telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#41E575', textDecoration: 'none' }}>💬 {lead.telefono}</a>
                            </div>
                            {lead.mensaje && (
                              <p style={{ fontSize: 12, color: T.muted, marginTop: 8, fontStyle: 'italic', borderLeft: `2px solid rgba(124,58,237,0.3)`, paddingLeft: 10 }}>
                                "{lead.mensaje}"
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: T.muted }}>
                              {new Date(lead.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                              {new Date(lead.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <a href={`https://wa.me/${lead.telefono.replace(/\D/g,'')}?text=Hola%20${encodeURIComponent(lead.nombre.split(' ')[0])}%2C%20gracias%20por%20tu%20inter%C3%A9s%20en%20Marca%20en%2090%20D%C3%ADas`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: 'rgba(65,229,117,0.12)', color: '#41E575', border: '1px solid rgba(65,229,117,0.25)', textDecoration: 'none' }}>
                              Contactar
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
        <>
          {/* ── Mobile bottom nav ── */}
          <nav style={{
            position:'fixed', bottom:0, left:0, right:0,
            height: `calc(64px + env(safe-area-inset-bottom))`,
            background:'rgba(28,27,27,0.96)', backdropFilter:'blur(20px)',
            WebkitBackdropFilter:'blur(20px)',
            borderTop:`1px solid ${T.border}`,
            display:'flex', alignItems:'flex-start', justifyContent:'space-around',
            zIndex:100, paddingTop:8,
            paddingBottom:'env(safe-area-inset-bottom)',
          }}>
            {/* Primary 5 tabs: dash, lista, clientes, equipo, prospectos */}
            {(['dash','lista','clientes','equipo','prospectos'] as const).map(id => {
              const n = NAV.find(x => x.id === id)!
              const active = activeNav === id
              return (
                <button key={id} onClick={() => { setActiveNav(id); setShowMobileMore(false) }} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                  flex:1, padding:'4px 0', borderRadius:0, background:'none', border:'none', cursor:'pointer',
                  color: active ? T.primary : T.muted,
                  transition:'color .15s',
                }}>
                  <div style={{
                    width:40, height:30, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
                    background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
                    transition:'background .15s',
                  }}>
                    <Icon name={n.icon} filled={active} size={22}/>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.03em', textTransform:'uppercase', lineHeight:1 }}>
                    {n.label.length > 7 ? n.label.slice(0,7) : n.label}
                  </span>
                </button>
              )
            })}

            {/* "Más" button */}
            <button onClick={() => setShowMobileMore(v => !v)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              flex:1, padding:'4px 0', borderRadius:0, background:'none', border:'none', cursor:'pointer',
              color: showMobileMore || ['metricas','pdf','finanzas'].includes(activeNav) ? T.primary : T.muted,
              transition:'color .15s',
            }}>
              <div style={{
                width:40, height:30, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
                background: showMobileMore ? 'rgba(124,58,237,0.18)' : 'transparent',
                transition:'background .15s',
              }}>
                <Icon name="more_horiz" size={22}/>
              </div>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.03em', textTransform:'uppercase', lineHeight:1 }}>Más</span>
            </button>
          </nav>

          {/* ── "Más" slide-up drawer ── */}
          {showMobileMore && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setShowMobileMore(false)}
                style={{ position:'fixed', inset:0, zIndex:90, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
              />
              {/* Sheet */}
              <div style={{
                position:'fixed', bottom:`calc(64px + env(safe-area-inset-bottom))`, left:0, right:0,
                zIndex:95, background:'rgba(28,27,27,0.98)', backdropFilter:'blur(24px)',
                borderTop:`1px solid ${T.borderMd}`, borderRadius:'20px 20px 0 0',
                padding:'16px 20px 20px',
              }}>
                <div style={{ width:36, height:4, background:'rgba(255,255,255,0.15)', borderRadius:2, margin:'0 auto 20px' }}/>
                <p style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>Más opciones</p>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {(['metricas','pdf','finanzas'] as const).map(id => {
                    const n = NAV.find(x => x.id === id)!
                    const active = activeNav === id
                    return (
                      <button key={id} onClick={() => { setActiveNav(id); setShowMobileMore(false) }} style={{
                        display:'flex', alignItems:'center', gap:14,
                        padding:'14px 16px', borderRadius:14, border:'none', cursor:'pointer',
                        background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
                        color: active ? T.primary : T.onSurf,
                        fontSize:15, fontWeight:600, textAlign:'left',
                        transition:'background .15s',
                      }}>
                        <Icon name={n.icon} filled={active} size={22}/>
                        {n.label}
                        {active && <span style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:T.primary }}/>}
                      </button>
                    )
                  })}
                  <div style={{ height:1, background:T.border, margin:'8px 0' }}/>
                  <button onClick={() => signOut({ callbackUrl:'/admin/login' })} style={{
                    display:'flex', alignItems:'center', gap:14,
                    padding:'14px 16px', borderRadius:14, border:'none', cursor:'pointer',
                    background:'transparent', color:'#f87171',
                    fontSize:15, fontWeight:600, textAlign:'left',
                  }}>
                    <Icon name="logout" size={22}/>
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </>
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
