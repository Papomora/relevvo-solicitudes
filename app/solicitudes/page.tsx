'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { signOut } from 'next-auth/react'
import { TIPOS, URGENCIAS, ESTADOS } from '@/lib/constants'

type Adjunto = { id: string; file: File; uploading: boolean; url?: string; error?: string }

type Solicitud = {
  id: number
  cliente: string
  tipo: string
  urgencia: string
  descripcion: string
  estado: string
  nota: string | null
  adjuntos: { url: string; name: string }[]
  createdAt: string
}

// ── Design tokens (same system as admin) ────────────────────────
const T = {
  bg:       '#131313',
  sidebar:  '#1C1B1B',
  surface:  '#201F1F',
  cardLow:  '#1C1B1B',
  cardHigh: '#2A2A2A',
  primary:  '#D2BBFF',
  primaryC: '#7C3AED',
  secondary:'#41E575',
  tertiary: '#FFB0CD',
  onSurf:   '#E5E2E1',
  muted:    '#6B7280',
  border:   'rgba(255,255,255,0.05)',
}

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

function StatusBadge({ estado }: { estado: string }) {
  const info = ESTADOS.find(s => s.value === estado) ?? ESTADOS[0]
  const c = info.color
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:999,
      fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em',
      background:`${c}15`, color:c,
    }}>{info.label}</span>
  )
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600)  return `Hace ${Math.round(diff/60)} min`
  if (diff < 86400) return `Hace ${Math.round(diff/3600)} h`
  if (diff < 172800) return 'Ayer'
  return `Hace ${Math.round(diff/86400)} días`
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [tipo, setTipo]               = useState('')
  const [urgencia, setUrgencia]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [sending, setSending]         = useState(false)
  const [success, setSuccess]         = useState(false)
  const [error, setError]             = useState('')
  const [lastPoll, setLastPoll]       = useState(new Date().toISOString())
  const [adjuntos, setAdjuntos]       = useState<Adjunto[]>([])
  const [dragOver, setDragOver]       = useState(false)
  const fileInputRef                  = useRef<HTMLInputElement>(null)

  const fetchSolicitudes = useCallback(async () => {
    const res = await fetch('/api/solicitudes')
    if (res.ok) setSolicitudes(await res.json())
  }, [])

  useEffect(() => { fetchSolicitudes() }, [fetchSolicitudes])

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/notifications?since=${lastPoll}`)
      if (res.ok) {
        const { count } = await res.json()
        if (count > 0) { fetchSolicitudes(); setLastPoll(new Date().toISOString()) }
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [lastPoll, fetchSolicitudes])

  async function uploadFile(id: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      setAdjuntos(prev => prev.map(a => a.id === id
        ? { ...a, uploading: false, url: data.url, error: data.error }
        : a
      ))
    } catch {
      setAdjuntos(prev => prev.map(a => a.id === id
        ? { ...a, uploading: false, error: 'Error al subir' } : a
      ))
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const slots = 5 - adjuntos.length
    if (slots <= 0) return
    const newItems: Adjunto[] = Array.from(fileList).slice(0, slots).map(file => ({
      id: Math.random().toString(36).slice(2),
      file, uploading: true,
    }))
    setAdjuntos(prev => [...prev, ...newItems])
    newItems.forEach(a => uploadFile(a.id, a.file))
  }

  function removeAdjunto(id: string) {
    setAdjuntos(prev => prev.filter(a => a.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!tipo || !urgencia || !descripcion.trim()) { setError('Completa todos los campos.'); return }
    setSending(true)
    const adjuntosPayload = adjuntos.filter(a => a.url).map(a => ({ url: a.url!, name: a.file.name }))
    const res = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, urgencia, descripcion, adjuntos: adjuntosPayload }),
    })
    setSending(false)
    if (res.ok) {
      setSuccess(true); setTipo(''); setUrgencia(''); setDescripcion(''); setAdjuntos([])
      fetchSolicitudes(); setTimeout(() => setSuccess(false), 4000)
    } else {
      setError('Error al enviar. Intenta de nuevo.')
    }
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', background:T.cardLow, border:'none', borderRadius:12,
    padding:'16px 20px', fontSize:14, color:T.onSurf, outline:'none',
    fontFamily:"'Inter', system-ui, sans-serif", appearance:'none' as any,
  }

  const NAV = [
    { icon:'dashboard',   label:'Dashboard',    active:false },
    { icon:'potted_plant',label:'Solicitudes',   active:true  },
    { icon:'leaderboard', label:'Métricas',      active:false },
    { icon:'description', label:'Reportes',      active:false },
  ]

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"/>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"/>

      <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'Inter', system-ui, sans-serif", color:T.onSurf, display:'flex' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width:256, flexShrink:0, height:'100vh', position:'sticky', top:0,
          background:T.sidebar, display:'flex', flexDirection:'column', padding:'0 12px 20px',
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
              <p style={{ fontSize:11, color:T.muted, fontWeight:500, marginTop:2 }}>Creative Portal</p>
            </div>
          </div>

          <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
            {NAV.map(n => (
              <div key={n.label} style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'11px 16px', borderRadius:14, cursor: n.active ? 'default' : 'default',
                fontSize:13, fontWeight:500,
                background: n.active ? 'linear-gradient(135deg, #7C3AED, #D2BBFF)' : 'transparent',
                color: n.active ? '#fff' : T.muted,
                boxShadow: n.active ? '0 0 20px rgba(124,58,237,0.3)' : 'none',
              }}>
                <Icon name={n.icon} filled={n.active}/>
                {n.label}
              </div>
            ))}
          </nav>

          <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:16, display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14, fontSize:13, color:T.muted, fontWeight:500 }}>
              <Icon name="help"/> Soporte
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} style={{
              display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:14,
              border:'none', cursor:'pointer', fontSize:13, color:T.muted,
              background:'transparent', fontWeight:500,
            }}>
              <Icon name="logout"/> Salir
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflowY:'auto' }}>

          {/* Top header */}
          <header style={{
            position:'sticky', top:0, zIndex:40,
            background:'rgba(19,19,19,0.85)', backdropFilter:'blur(20px)',
            WebkitBackdropFilter:'blur(20px)',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'0 40px', height:72, borderBottom:`1px solid ${T.border}`,
          }}>
            <h2 style={{
              fontSize:22, fontWeight:700, letterSpacing:'-.03em',
              background:'linear-gradient(135deg, #9F67FF, #D2BBFF)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
            }}>Nueva Solicitud</h2>

            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button style={{ padding:8, borderRadius:'50%', background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex' }}>
                <Icon name="notifications" size={22}/>
              </button>
              <button style={{ padding:8, borderRadius:'50%', background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex' }}>
                <Icon name="settings" size={22}/>
              </button>
              <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', marginLeft:6 }}>
                R
              </div>
            </div>
          </header>

          {/* Content */}
          <div style={{ padding:'40px 40px 80px', maxWidth:1100, width:'100%' }}>

            {/* ── Form + Tips grid ── */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:48, marginBottom:80 }}>

              {/* Left: Form */}
              <div style={{ display:'flex', flexDirection:'column', gap:28 }}>

                {/* Tipo + Urgencia */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:'.15em', display:'block', marginBottom:10 }}>Tipo de solicitud</label>
                    <div style={{ position:'relative' }}>
                      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inputStyle, paddingRight:44, cursor:'pointer' }}>
                        <option value="">Selecciona…</option>
                        {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', color:T.muted, pointerEvents:'none', display:'flex' }}>
                        <Icon name="expand_more" size={20}/>
                      </span>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:'.15em', display:'block', marginBottom:10 }}>Prioridad</label>
                    <div style={{ position:'relative' }}>
                      <select value={urgencia} onChange={e => setUrgencia(e.target.value)} style={{ ...inputStyle, paddingRight:44, cursor:'pointer' }}>
                        <option value="">Selecciona…</option>
                        {URGENCIAS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', color:T.muted, pointerEvents:'none', display:'flex' }}>
                        <Icon name="expand_more" size={20}/>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:'.15em', display:'block', marginBottom:10 }}>Descripción del proyecto</label>
                  <textarea
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    rows={6}
                    placeholder="Describe los objetivos y detalles de tu solicitud con el mayor detalle posible…"
                    style={{ ...inputStyle, resize:'none', lineHeight:1.65 }}
                  />
                </div>

                {/* Upload zone */}
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:'.15em', display:'block', marginBottom:10 }}>
                    Assets & Referencias
                    <span style={{ marginLeft:8, fontWeight:400, textTransform:'none', letterSpacing:0, color:'#374151' }}>PNG, JPG, PDF · máx. 10 MB · expiran en 48 h</span>
                  </label>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                    style={{
                      border: `2px dashed ${dragOver ? T.primaryC : 'rgba(255,255,255,0.07)'}`,
                      borderRadius:16, padding:'36px 24px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:12,
                      background: dragOver ? 'rgba(124,58,237,0.08)' : 'rgba(28,27,27,0.4)',
                      cursor:'pointer', transition:'all .2s',
                    }}
                  >
                    <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(124,58,237,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:T.primary }}>
                      <Icon name="cloud_upload" size={26}/>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:13, fontWeight:500, color:T.onSurf, marginBottom:3 }}>Haz clic o arrastra archivos aquí</p>
                      <p style={{ fontSize:12, color:T.muted }}>Hasta 5 archivos · máx. 10 MB cada uno</p>
                    </div>
                  </div>

                  {/* Hidden input */}
                  <input
                    ref={fileInputRef}
                    type="file" multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf"
                    style={{ display:'none' }}
                    onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
                  />

                  {/* File list */}
                  {adjuntos.length > 0 && (
                    <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
                      {adjuntos.map(a => (
                        <div key={a.id} style={{
                          display:'flex', alignItems:'center', gap:10,
                          padding:'8px 14px', borderRadius:10,
                          background: a.error ? 'rgba(255,176,205,0.08)' : a.uploading ? 'rgba(124,58,237,0.08)' : 'rgba(65,229,117,0.07)',
                        }}>
                          <Icon name={a.error ? 'error' : a.uploading ? 'hourglass_top' : 'check_circle'} filled size={16}
                            style={{ color: a.error ? T.tertiary : a.uploading ? T.primary : T.secondary } as any}/>
                          <span style={{ flex:1, fontSize:12, color:T.onSurf, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {a.file.name}
                          </span>
                          {a.error && <span style={{ fontSize:11, color:T.tertiary }}>{a.error}</span>}
                          {a.uploading && <span style={{ fontSize:11, color:T.muted }}>Subiendo…</span>}
                          {!a.uploading && <button onClick={() => removeAdjunto(a.id)} style={{ background:'none', border:'none', cursor:'pointer', color:T.muted, display:'flex', padding:2 }}>
                            <Icon name="close" size={14}/>
                          </button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Feedback */}
                {error   && <p style={{ fontSize:13, color:'#FFB0CD', fontWeight:500 }}>⚠ {error}</p>}
                {success && <p style={{ fontSize:13, color:'#41E575', fontWeight:500 }}>✓ Solicitud enviada correctamente.</p>}

                {/* Submit */}
                <button
                  onClick={handleSubmit as any}
                  disabled={sending}
                  style={{
                    width:'100%', height:60, borderRadius:14, border:'none',
                    cursor: sending ? 'wait' : 'pointer',
                    background:'linear-gradient(135deg, #7C3AED, #D2BBFF)',
                    color:'#fff', fontWeight:700, fontSize:16,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                    boxShadow:'0 0 30px rgba(124,58,237,0.3)',
                    opacity: sending ? .7 : 1,
                    fontFamily:"'Inter', system-ui, sans-serif",
                    transition:'all .2s',
                  }}
                >
                  {sending ? 'Enviando…' : 'Enviar solicitud'}
                  {!sending && <Icon name="send" size={18}/>}
                </button>
              </div>

              {/* Right: Guide + image */}
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                {/* Guide card */}
                <div style={{
                  background:'rgba(42,42,42,0.6)', backdropFilter:'blur(40px)',
                  WebkitBackdropFilter:'blur(40px)', borderRadius:16,
                  border:`1px solid ${T.border}`, padding:28,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
                    <div style={{ width:46, height:46, borderRadius:14, background:'rgba(65,229,117,0.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'#41E575' }}>
                      <Icon name="bolt" filled size={22}/>
                    </div>
                    <h3 style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:'-.02em' }}>Guía de Solicitud</h3>
                  </div>
                  <ul style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    {[
                      'Sé específico con las dimensiones y formatos finales necesarios.',
                      'Incluye referencias visuales o enlaces a tableros de Pinterest si es posible.',
                      'El tiempo de entrega se calcula tras la validación técnica del equipo.',
                    ].map((tip, i) => (
                      <li key={i} style={{ display:'flex', gap:12, fontSize:13, color:T.muted, lineHeight:1.6 }}>
                        <span style={{ color:'#9F67FF', fontWeight:700, flexShrink:0 }}>0{i+1}.</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Decorative quote card */}
                <div style={{ borderRadius:16, overflow:'hidden', height:200, position:'relative', background:'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(28,27,27,0.9))' }}>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', display:'flex', alignItems:'flex-end', padding:24 }}>
                    <p style={{ fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.6)', fontStyle:'italic', lineHeight:1.6 }}>
                      "La creatividad es la inteligencia<br/>divirtiéndose." — Relevvo Team
                    </p>
                  </div>
                  {/* Purple orbs for visual interest */}
                  <div style={{ position:'absolute', top:-20, right:-20, width:120, height:120, background:'rgba(124,58,237,0.25)', borderRadius:'50%', filter:'blur(40px)' }}/>
                  <div style={{ position:'absolute', bottom:20, left:10, width:80, height:80, background:'rgba(255,176,205,0.15)', borderRadius:'50%', filter:'blur(30px)' }}/>
                </div>
              </div>
            </div>

            {/* ── Recent Activity ── */}
            <section>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24 }}>
                <div>
                  <h3 style={{ fontSize:20, fontWeight:700, color:'#fff', letterSpacing:'-.03em', marginBottom:4 }}>Actividad Reciente</h3>
                  <p style={{ fontSize:13, color:T.muted }}>Historial de tus últimas solicitudes creativas</p>
                </div>
              </div>

              {solicitudes.length === 0 ? (
                <p style={{ fontSize:14, color:T.muted, textAlign:'center', padding:'48px 0' }}>Aún no tienes solicitudes enviadas.</p>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
                  {solicitudes.slice(0, 6).map(s => {
                    const est = ESTADOS.find(e => e.value === s.estado) ?? ESTADOS[0]
                    return (
                      <div key={s.id} style={{
                        background:T.cardLow, borderRadius:16, padding:24,
                        display:'flex', flexDirection:'column', gap:16,
                        position:'relative', overflow:'hidden', cursor:'default',
                        transition:'background .2s',
                      }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.cardHigh}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background=T.cardLow}
                      >
                        {/* Ambient glow */}
                        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, background:`${est.color}08`, borderRadius:'50%', filter:'blur(30px)' }}/>

                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <StatusBadge estado={s.estado}/>
                          <span style={{ fontSize:10, color:T.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em' }}>
                            {timeAgo(s.createdAt)}
                          </span>
                        </div>

                        <div>
                          <h4 style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:5, letterSpacing:'-.01em' }}>{s.tipo}</h4>
                          <p style={{ fontSize:12, color:T.muted, lineHeight:1.55, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{s.descripcion}</p>
                        </div>

                        {s.adjuntos?.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                            {s.adjuntos.map((a, i) => (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                                display:'inline-flex', alignItems:'center', gap:5,
                                fontSize:11, padding:'3px 9px', borderRadius:7,
                                background:'rgba(124,58,237,0.12)', color:T.primary,
                                textDecoration:'none', fontWeight:500,
                              }}>
                                <Icon name="attach_file" size={12}/>{a.name}
                              </a>
                            ))}
                          </div>
                        )}
                        {s.nota && (
                          <div style={{ paddingTop:12, borderTop:`1px solid ${T.border}` }}>
                            <p style={{ fontSize:11, color:T.primary, fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:'.08em' }}>Nota de Relevvo</p>
                            <p style={{ fontSize:12, color:'rgba(229,226,225,0.5)', lineHeight:1.5 }}>{s.nota}</p>
                          </div>
                        )}

                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:4 }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg,#7C3AED,#D2BBFF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff' }}>
                            R
                          </div>
                          <span style={{ fontSize:10, color:T.muted }}>Relevvo Studio</span>
                          <span style={{ fontSize:10, color:'#374151', marginLeft:'auto' }}>
                            {new Date(s.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  )
}
