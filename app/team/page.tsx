'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut, signIn } from 'next-auth/react'

const T = {
  bg:'#0D0D0D', card:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  primary:'#D2BBFF', primaryC:'#7C3AED', secondary:'#41E575',
  surface:'#1A1A1A', onSurf:'#E5E2E1', muted:'#8B96A2',
}

const ROLES: Record<string,{label:string;color:string;icon:string}> = {
  director: { label:'Director creativo', color:'#A78BFA', icon:'🎨' },
  cm:       { label:'Community Manager', color:'#67E8F9', icon:'📱' },
  editora:  { label:'Editora de video',  color:'#F9A8D4', icon:'🎬' },
  miguel:   { label:'Trafficker',        color:'#6EE7B7', icon:'📈' },
}

const FREQS = ['diario','semanal','quincenal','mensual'] as const
const FREQ_LABELS: Record<string,string> = { diario:'Diario',semanal:'Semanal',quincenal:'Quincenal',mensual:'Mensual' }

const DEFAULT_TASKS: Record<string, Record<string,string[]>> = {
  director: {
    diario:    ['Revisar y aprobar piezas en producción','Diseñar piezas sociales del día','Responder bloqueos del equipo'],
    semanal:   ['Revisar parrilla CM — martes','1 video alta dificultad','Reunión clientes (WhatsApp)'],
    quincenal: ['Revisión de cumplimiento del equipo','Ajuste de prioridades y carga'],
    mensual:   ['Revisión estratégica Crusso · Molicie · Groi','Actualizar plan de contenido','Evaluación desempeño interno'],
  },
  cm: {
    diario:    ['Publicar según parrilla aprobada','Monitoreo comentarios e interacciones','Generar imágenes piezas del día'],
    semanal:   ['Entregar parrilla semana siguiente — lunes','Reporte engagement por cliente'],
    quincenal: ['Revisión tono y consistencia de marca'],
    mensual:   ['12 posts + historias Crusso ✓','12 posts + historias Molicie ✓','10 publicaciones Groi (4 cuentas) ✓','Análisis mejores/peores piezas'],
  },
  editora: {
    diario:    ['3 videos diarios para Molicie','Revisión y ajuste según feedback','Organizar archivos por cliente'],
    semanal:   ['1 video alta complejidad completado','Revisión backlog pendientes'],
    quincenal: ['Reporte producción: entregados vs planeados'],
    mensual:   ['Balance producción audiovisual','Propuesta mejoras flujo editorial'],
  },
  miguel: {
    diario:    ['Revisar métricas campañas activas','Ajuste presupuesto si hay alarmas'],
    semanal:   ['Reporte semanal (ROAS, CPA, alcance) — viernes','Revisión creativos en pauta vs disponibles','Propuesta mejoras o cambios targeting'],
    quincenal: ['Revisión presupuesto quincenal por cliente','Análisis comparativo rendimiento'],
    mensual:   ['Informe tráfico pago mensual por cliente','Planificación campañas mes siguiente','Control límite 3 campañas/mes (máx 9)'],
  },
}

// ── Login form ─────────────────────────────────────────────────
function LoginForm() {
  const [nombre, setNombre] = useState('')
  const [pass,   setPass]   = useState('')
  const [error,  setError]  = useState('')
  const [loading,setLoading]= useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await signIn('team-member', { nombre: nombre.trim(), password: pass.trim(), redirect: false })
    if (res?.error) setError('Usuario o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✦</div>
          <h1 style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:'-.03em', margin:0 }}>Relevvo Studio</h1>
          <p style={{ fontSize:13, color:T.muted, marginTop:6 }}>Panel de equipo — Seguimiento semanal</p>
        </div>
        <form onSubmit={handleLogin} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:28 }}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Usuario</label>
            <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Tu nombre..."
              style={{ width:'100%', background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 14px', fontSize:14, color:'#fff', outline:'none' }} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"
              style={{ width:'100%', background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 14px', fontSize:14, color:'#fff', outline:'none' }} />
          </div>
          {error && <p style={{ color:'#F87171', fontSize:12, marginBottom:12 }}>{error}</p>}
          <button type="submit" disabled={loading || !nombre || !pass}
            style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:T.primaryC, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', opacity:loading||!nombre||!pass?.5:1 }}>
            {loading ? 'Entrando...' : 'Entrar al panel →'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Ring progress ──────────────────────────────────────────────
function Ring({ pct, color, size=64 }: { pct:number; color:string; size?:number }) {
  const r=(size-8)/2, circ=2*Math.PI*r
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round" style={{transition:'stroke-dasharray .5s ease'}}/>
    </svg>
  )
}

// ── Main dashboard ─────────────────────────────────────────────
function Dashboard({ nombre, rol }: { nombre:string; rol:string }) {
  const [semana, setSemana] = useState<any>(null)
  const patchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const fetchSem = useCallback(async () => {
    const r = await fetch('/api/team/seguimiento')
    if (!r.ok) return
    const d = await r.json()
    setSemana(d.semana)
  }, [])

  useEffect(() => { fetchSem() }, [fetchSem])

  const patchTasks = useCallback((tareas: any, notas?: any) => {
    if (!semana) return
    setSemana((p:any) => ({ ...p, tareas: { ...(p.tareas??{}), [rol]: tareas }, ...(notas!==undefined ? { notas:{...(p.notas??{}),[rol]:notas} } : {}) }))
    if (patchTimer.current) clearTimeout(patchTimer.current)
    patchTimer.current = setTimeout(() => {
      fetch('/api/team/seguimiento', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ semanaId: semana.id, tareas, ...(notas!==undefined && {notas}) }),
      })
    }, 400)
  }, [semana, rol])

  const toggleTask = (freq:string, idx:number, val:boolean) => {
    const cur = semana?.tareas?.[rol] ?? {}
    const arr = [...(cur[freq] ?? DEFAULT_TASKS[rol]?.[freq]?.map(()=>false) ?? [])]
    arr[idx] = val
    patchTasks({ ...cur, [freq]: arr })
  }

  const getTaskList = (freq:string): string[] =>
    semana?.notas?.customTasks?.[rol]?.[freq] ?? DEFAULT_TASKS[rol]?.[freq] ?? []

  const calcProg = () => {
    if (!semana) return { done:0, total:0, pct:0 }
    const t = semana.tareas?.[rol] ?? {}
    let done=0, total=0
    for (const f of FREQS) {
      const arr: boolean[] = t[f] ?? []
      done  += arr.filter(Boolean).length
      total += getTaskList(f).length
    }
    return { done, total, pct: total>0?Math.round(done/total*100):0 }
  }

  const { done, total, pct } = calcProg()
  const R = ROLES[rol] ?? { label:rol, color:T.primary, icon:'👤' }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, padding:'0 0 80px' }}>
      {/* Header */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:20 }}>{R.icon}</span>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{nombre}</div>
            <div style={{ fontSize:11, color:T.muted }}>{R.label}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {semana && <span style={{ fontSize:12, color:T.muted }}>Sem #{semana.semana} · {semana.inicio}</span>}
          <button onClick={()=>signOut({callbackUrl:'/team'})}
            style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontSize:12, cursor:'pointer' }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'24px 20px' }}>

        {/* Progress ring */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:24, marginBottom:20, display:'flex', alignItems:'center', gap:20 }}>
          <div style={{ position:'relative', width:72, height:72, flexShrink:0 }}>
            <Ring pct={pct} color={R.color} size={72} />
            <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:R.color }}>{pct}%</span>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'#fff', letterSpacing:'-.03em' }}>
              {done} de {total} tareas
            </div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>
              {pct === 100 ? '🎉 ¡Todo al día esta semana!' : pct >= 70 ? '💪 ¡Vas muy bien!' : pct >= 40 ? '⚡ Sigue adelante' : '📋 Empecemos'}
            </div>
            <div style={{ marginTop:10, height:6, width:200, background:'rgba(255,255,255,0.07)', borderRadius:6, overflow:'hidden' }}>
              <div style={{ width:`${pct}%`, height:'100%', background:R.color, borderRadius:6, transition:'width .4s' }}/>
            </div>
          </div>
        </div>

        {!semana ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:T.muted }}>
            <p style={{ fontSize:14 }}>No hay semana activa todavía.</p>
            <p style={{ fontSize:12, marginTop:6 }}>Espera a que el director cree la semana.</p>
          </div>
        ) : (
          FREQS.map(freq => {
            const tasks = getTaskList(freq)
            const checked: boolean[] = semana?.tareas?.[rol]?.[freq] ?? tasks.map(()=>false)
            const doneFq = checked.filter(Boolean).length
            return (
              <div key={freq} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px 18px', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.12em' }}>
                    {FREQ_LABELS[freq]}
                  </span>
                  <span style={{ fontSize:11, color:doneFq===tasks.length?R.color:T.muted, fontWeight:600 }}>
                    {doneFq}/{tasks.length}
                    {doneFq===tasks.length && tasks.length>0 && ' ✓'}
                  </span>
                </div>
                {tasks.map((task, i) => (
                  <label key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:`1px solid ${T.border}`, cursor:'pointer' }}
                    className="task-row">
                    <div style={{ position:'relative', flexShrink:0, marginTop:1 }}>
                      <input type="checkbox" checked={!!checked[i]} onChange={e=>toggleTask(freq,i,e.target.checked)}
                        style={{ width:18, height:18, accentColor:R.color, cursor:'pointer' }} />
                    </div>
                    <span style={{ fontSize:14, color:checked[i]?T.muted:'#fff', textDecoration:checked[i]?'line-through':'none', lineHeight:1.5, transition:'all .2s', flex:1 }}>
                      {task}
                    </span>
                    {checked[i] && <span style={{ fontSize:14, color:R.color, flexShrink:0 }}>✓</span>}
                  </label>
                ))}
              </div>
            )
          })
        )}

        {/* Notes */}
        {semana && (
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px 18px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10 }}>
              Notas personales
            </p>
            <textarea value={semana?.notas?.[rol]??''} rows={3}
              onChange={e=>{
                const n={...(semana?.notas??{})}; n[rol]=e.target.value
                setSemana((p:any)=>({...p,notas:n}))
                if(patchTimer.current) clearTimeout(patchTimer.current)
                patchTimer.current=setTimeout(()=>{
                  fetch('/api/team/seguimiento',{method:'PATCH',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({semanaId:semana.id,notas:e.target.value})})
                },400)
              }}
              placeholder="Bloqueos, logros, observaciones..."
              style={{ width:'100%', background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:T.onSurf, resize:'vertical', outline:'none', lineHeight:1.5 }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function TeamPage() {
  const { data: session, status } = useSession()
  const user = session?.user as any

  if (status === 'loading') return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:T.muted, fontSize:14 }}>Cargando...</div>
    </div>
  )

  if (!session || user?.role !== 'team') return <LoginForm />

  return <Dashboard nombre={user.name ?? ''} rol={user.rol ?? ''} />
}
