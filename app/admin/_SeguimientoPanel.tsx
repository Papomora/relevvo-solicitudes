'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ── Design tokens (mirrors main admin T) ───────────────────────
const T = {
  bg:'#131313', sidebar:'#1C1B1B', card:'rgba(255,255,255,0.04)', cardHigh:'#2A2A2A',
  primary:'#D2BBFF', primaryC:'#7C3AED', secondary:'#41E575', tertiary:'#FFB0CD',
  surface:'#201F1F', onSurf:'#E5E2E1', muted:'#8B96A2', border:'rgba(255,255,255,0.07)', borderMd:'rgba(255,255,255,0.11)',
}

// ── Roles config ───────────────────────────────────────────────
const ROLES = {
  director: { label:'Director', icon:'🎨', color:'#A78BFA' },
  cm:       { label:'CM',       icon:'📱', color:'#67E8F9' },
  editora:  { label:'Editora',  icon:'🎬', color:'#F9A8D4' },
  miguel:   { label:'Trafficker',icon:'📈',color:'#6EE7B7' },
} as const
type RolKey = keyof typeof ROLES

const FREQS = ['diario','semanal','quincenal','mensual'] as const
const FREQ_LABELS: Record<string,string> = { diario:'Diario',semanal:'Semanal',quincenal:'Quincenal',mensual:'Mensual' }

const DEFAULT_TASKS: Record<RolKey, Record<string,string[]>> = {
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

// ── Circular SVG ring ──────────────────────────────────────────
function Ring({ pct, color, size=56 }: { pct:number; color:string; size?:number }) {
  const r = (size-8)/2, circ = 2*Math.PI*r
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round" style={{ transition:'stroke-dasharray .5s ease' }}/>
    </svg>
  )
}

// ── Bar chart row ──────────────────────────────────────────────
function BarRow({ label, pct, color }: { label:string; pct:number; color:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
      <span style={{ fontSize:11, color:T.muted, minWidth:60 }}>{label}</span>
      <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)', borderRadius:6, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:6, transition:'width .4s ease' }}/>
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:32, textAlign:'right' }}>{pct}%</span>
    </div>
  )
}

export default function SeguimientoPanel() {
  const [semanas,    setSemanas]    = useState<any[]>([])
  const [semActual,  setSemActual]  = useState<any>(null)
  const [rolActivo,  setRolActivo]  = useState<RolKey>('director')
  const [semModal,   setSemModal]   = useState(false)
  const [nuevaSem,   setNuevaSem]   = useState('')
  const [nuevaIni,   setNuevaIni]   = useState('')
  const [nuevaFin,   setNuevaFin]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [notifMsg,   setNotifMsg]   = useState('')
  const [editingTask,setEditingTask]= useState<{rol:string;freq:string;idx:number;val:string}|null>(null)
  const [addTask,    setAddTask]    = useState<{rol:string;freq:string}|null>(null)
  const [addTaskVal, setAddTaskVal] = useState('')
  const patchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const fetchSems = useCallback(async () => {
    const r = await fetch('/api/admin/seguimiento')
    if (!r.ok) return
    const data = await r.json()
    setSemanas(data)
    setSemActual((prev:any) => prev ? (data.find((s:any)=>s.id===prev.id) ?? data[0] ?? null) : (data[0] ?? null))
  }, [])

  useEffect(() => { fetchSems() }, [fetchSems])

  const patchSem = useCallback((patch: object) => {
    if (!semActual) return
    setSemActual((p:any) => ({...p,...patch}))
    if (patchTimer.current) clearTimeout(patchTimer.current)
    patchTimer.current = setTimeout(() => {
      fetch(`/api/admin/seguimiento/${semActual.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch),
      })
    }, 400)
  }, [semActual])

  // ── Progress calculation ──────────────────────────────────────
  const calcProg = (rol: RolKey) => {
    const t = semActual?.tareas?.[rol] ?? {}
    let done=0, total=0
    for (const f of FREQS) {
      const arr: boolean[] = t[f] ?? []
      done  += arr.filter(Boolean).length
      total += DEFAULT_TASKS[rol]?.[f]?.length ?? 0
    }
    return { done, total, pct: total>0 ? Math.round(done/total*100) : 0 }
  }

  const totalProg = () => {
    let d=0,t=0
    for (const r of Object.keys(ROLES) as RolKey[]) { const p=calcProg(r); d+=p.done; t+=p.total }
    return { done:d, total:t, pct: t>0?Math.round(d/t*100):0 }
  }

  // ── Task helpers ──────────────────────────────────────────────
  const toggleTask = (rol:RolKey, freq:string, idx:number, val:boolean) => {
    const t = JSON.parse(JSON.stringify(semActual?.tareas ?? {}))
    if (!t[rol]) t[rol]={}
    const arr = [...(t[rol][freq] ?? DEFAULT_TASKS[rol][freq].map(()=>false))]
    arr[idx] = val; t[rol][freq] = arr
    patchSem({ tareas: t })
  }

  const deleteTask = (rol:RolKey, freq:string, idx:number) => {
    const t = JSON.parse(JSON.stringify(semActual?.tareas ?? {}))
    const tasks = [...(DEFAULT_TASKS[rol]?.[freq] ?? [])] // note: modifying config not DB, so just track overrides
    // Store custom task list in notas.customTasks
    const notas = JSON.parse(JSON.stringify(semActual?.notas ?? {}))
    if (!notas.customTasks) notas.customTasks = {}
    if (!notas.customTasks[rol]) notas.customTasks[rol] = {}
    if (!notas.customTasks[rol][freq]) notas.customTasks[rol][freq] = [...tasks]
    notas.customTasks[rol][freq].splice(idx, 1)
    if (!t[rol]) t[rol]={}
    const bools = [...(t[rol][freq] ?? tasks.map(()=>false))]
    bools.splice(idx, 1)
    t[rol][freq] = bools
    patchSem({ tareas: t, notas })
  }

  const addNewTask = (rol:RolKey, freq:string, val:string) => {
    if (!val.trim()) return
    const notas = JSON.parse(JSON.stringify(semActual?.notas ?? {}))
    if (!notas.customTasks) notas.customTasks = {}
    if (!notas.customTasks[rol]) notas.customTasks[rol] = {}
    const base = DEFAULT_TASKS[rol]?.[freq] ?? []
    if (!notas.customTasks[rol][freq]) notas.customTasks[rol][freq] = [...base]
    notas.customTasks[rol][freq].push(val.trim())
    const t = JSON.parse(JSON.stringify(semActual?.tareas ?? {}))
    if (!t[rol]) t[rol]={}
    const bools = [...(t[rol][freq] ?? base.map(()=>false))]
    bools.push(false)
    t[rol][freq] = bools
    patchSem({ tareas: t, notas })
    setAddTask(null); setAddTaskVal('')
  }

  const updateTask = (rol:RolKey, freq:string, idx:number, val:string) => {
    if (!val.trim()) return
    const notas = JSON.parse(JSON.stringify(semActual?.notas ?? {}))
    if (!notas.customTasks) notas.customTasks = {}
    if (!notas.customTasks[rol]) notas.customTasks[rol] = {}
    const base = DEFAULT_TASKS[rol]?.[freq] ?? []
    if (!notas.customTasks[rol][freq]) notas.customTasks[rol][freq] = [...base]
    notas.customTasks[rol][freq][idx] = val.trim()
    patchSem({ notas })
    setEditingTask(null)
  }

  const getTaskList = (rol:RolKey, freq:string): string[] => {
    return semActual?.notas?.customTasks?.[rol]?.[freq] ?? DEFAULT_TASKS[rol]?.[freq] ?? []
  }

  // ── WA notifications ──────────────────────────────────────────
  const sendNotif = async (tipo:'notify'|'recordatorio'|'cierre') => {
    if (!semActual) return
    setSaving(true); setNotifMsg('Enviando...')
    const path = tipo==='notify' ? 'notify' : 'recordatorio'
    const body = tipo==='cierre' ? {tipo:'cierre'} : {}
    const r = await fetch(`/api/admin/seguimiento/${semActual.id}/${path}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    })
    const d = await r.json()
    setNotifMsg(`✅ Enviado a ${d.enviados ?? 0} personas`)
    setSaving(false)
    setTimeout(()=>setNotifMsg(''), 3000)
  }

  const prog = totalProg()
  const card: React.CSSProperties = { background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px 18px' }

  // ── No semana state ───────────────────────────────────────────
  if (!semActual) return (
    <div style={{ textAlign:'center', padding:'60px 24px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📅</div>
      <p style={{ fontSize:16, color:T.onSurf, fontWeight:700, marginBottom:8 }}>No hay semana activa</p>
      <p style={{ fontSize:13, color:T.muted, marginBottom:24 }}>Crea la primera semana para empezar el seguimiento</p>
      <button onClick={()=>setSemModal(true)}
        style={{ padding:'12px 28px', borderRadius:12, border:'none', background:T.primaryC, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>
        ＋ Crear semana
      </button>
      {semModal && <NewWeekModal onClose={()=>setSemModal(false)} onSave={async(s,i,f)=>{
        setSaving(true)
        const r = await fetch('/api/admin/seguimiento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({semana:parseInt(s),inicio:i,fin:f})})
        if(r.ok){ await fetchSems(); setSemModal(false) }
        setSaving(false)
      }} saving={saving} />}
    </div>
  )

  return (
    <div style={{ maxWidth:860 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:'-.03em', margin:0 }}>
            Seguimiento del Equipo
          </h2>
          <p style={{ fontSize:12, color:T.muted, marginTop:2 }}>
            Semana #{semActual.semana} · {semActual.inicio} → {semActual.fin}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={semActual.id} onChange={e=>{ const s=semanas.find((x:any)=>x.id===parseInt(e.target.value)); if(s) setSemActual(s) }}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'7px 12px', fontSize:12, color:T.onSurf, cursor:'pointer' }}>
            {semanas.map((s:any)=><option key={s.id} value={s.id}>Sem #{s.semana} · {s.inicio}</option>)}
          </select>
          <button onClick={()=>setSemModal(true)}
            style={{ padding:'7px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', color:T.primary, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ＋ Nueva
          </button>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'📲 Tareas de la semana', sub:'Enviar a todo el equipo', color:'rgba(65,229,117,0.15)', border:'rgba(65,229,117,0.3)', fn:()=>sendNotif('notify') },
          { label:'📊 Recordatorio avance', sub:'Resumen por persona', color:'rgba(124,58,237,0.15)', border:'rgba(124,58,237,0.3)', fn:()=>sendNotif('recordatorio') },
          { label:'✅ Cierre de semana', sub:'Resumen final al equipo', color:'rgba(255,176,205,0.15)', border:'rgba(255,176,205,0.3)', fn:()=>sendNotif('cierre') },
        ].map((a,i)=>(
          <button key={i} disabled={saving} onClick={a.fn}
            style={{ padding:'14px 16px', borderRadius:14, border:`1px solid ${a.border}`, background:a.color, cursor:'pointer', textAlign:'left', opacity:saving?.6:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:3 }}>{a.label}</div>
            <div style={{ fontSize:11, color:T.muted }}>{a.sub}</div>
          </button>
        ))}
      </div>
      {notifMsg && <p style={{ fontSize:12, color:T.secondary, marginBottom:12, fontWeight:600 }}>{notifMsg}</p>}

      {/* ── Team overview rings ── */}
      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Progreso general</span>
          <span style={{ fontSize:12, color: prog.pct>=80?T.secondary:prog.pct>=50?T.primary:T.tertiary, fontWeight:700 }}>
            {prog.done}/{prog.total} tareas · {prog.pct}%
          </span>
        </div>
        <div style={{ display:'flex', gap:12, marginBottom:14, overflow:'auto', paddingBottom:4 }}>
          {(Object.keys(ROLES) as RolKey[]).map(rol => {
            const { done, total, pct } = calcProg(rol)
            const R = ROLES[rol]
            return (
              <button key={rol} onClick={()=>setRolActivo(rol)}
                style={{ flex:1, minWidth:120, padding:'14px 10px', borderRadius:14, border:`2px solid ${rolActivo===rol?R.color:T.border}`, background:rolActivo===rol?`${R.color}15`:T.card, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, transition:'all .2s' }}>
                <div style={{ position:'relative', width:56, height:56 }}>
                  <Ring pct={pct} color={R.color} />
                  <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:R.color }}>{pct}%</span>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:rolActivo===rol?'#fff':T.muted }}>{R.label}</div>
                <div style={{ fontSize:10, color:T.muted }}>{done}/{total}</div>
              </button>
            )
          })}
        </div>
        <BarRow label="Equipo" pct={prog.pct} color={prog.pct>=80?T.secondary:prog.pct>=50?T.primary:T.tertiary} />
      </div>

      {/* ── Task list for active role ── */}
      <div style={{ ...card }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>{ROLES[rolActivo].icon}</span>
            <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{ROLES[rolActivo].label}</span>
          </div>
          <span style={{ fontSize:11, color:T.muted }}>
            {calcProg(rolActivo).done}/{calcProg(rolActivo).total} completadas
          </span>
        </div>

        {FREQS.map(freq => {
          const tasks = getTaskList(rolActivo, freq)
          const checked: boolean[] = semActual?.tareas?.[rolActivo]?.[freq] ?? tasks.map(()=>false)
          return (
            <div key={freq} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.12em' }}>
                  {FREQ_LABELS[freq]}
                </span>
                <button onClick={()=>setAddTask({rol:rolActivo,freq})}
                  style={{ fontSize:10, color:T.primary, background:'transparent', border:'none', cursor:'pointer', fontWeight:600 }}>
                  + agregar
                </button>
              </div>
              {tasks.map((task, i) => (
                <div key={i}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
                  <input type="checkbox" checked={!!checked[i]}
                    onChange={e=>toggleTask(rolActivo, freq, i, e.target.checked)}
                    style={{ width:15, height:15, accentColor:ROLES[rolActivo].color, flexShrink:0, cursor:'pointer' }} />
                  {editingTask?.rol===rolActivo&&editingTask.freq===freq&&editingTask.idx===i ? (
                    <input autoFocus value={editingTask.val} onChange={e=>setEditingTask({...editingTask,val:e.target.value})}
                      onKeyDown={e=>{ if(e.key==='Enter') updateTask(rolActivo,freq,i,editingTask.val); if(e.key==='Escape') setEditingTask(null) }}
                      onBlur={()=>updateTask(rolActivo,freq,i,editingTask.val)}
                      style={{ flex:1, background:'transparent', border:'none', borderBottom:`1px solid ${ROLES[rolActivo].color}`, color:'#fff', fontSize:13, outline:'none', padding:'2px 4px' }} />
                  ) : (
                    <span style={{ flex:1, fontSize:13, color:checked[i]?T.muted:'#fff', textDecoration:checked[i]?'line-through':'none', transition:'all .15s', lineHeight:1.4 }}>
                      {task}
                    </span>
                  )}
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button onClick={()=>setEditingTask({rol:rolActivo,freq,idx:i,val:task})}
                      title="Editar" style={{ fontSize:11, padding:'2px 6px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer' }}>✏️</button>
                    <button onClick={()=>deleteTask(rolActivo,freq,i)}
                      title="Eliminar" style={{ fontSize:11, padding:'2px 6px', borderRadius:6, border:'1px solid rgba(248,113,113,0.3)', background:'transparent', color:'#F87171', cursor:'pointer' }}>✕</button>
                  </div>
                </div>
              ))}
              {addTask?.rol===rolActivo && addTask.freq===freq && (
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <input autoFocus value={addTaskVal} onChange={e=>setAddTaskVal(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') addNewTask(rolActivo,freq,addTaskVal); if(e.key==='Escape'){setAddTask(null);setAddTaskVal('')} }}
                    placeholder="Nueva tarea... (Enter para guardar)"
                    style={{ flex:1, background:T.surface, border:`1px solid ${ROLES[rolActivo].color}`, borderRadius:8, padding:'7px 12px', fontSize:12, color:'#fff', outline:'none' }} />
                  <button onClick={()=>addNewTask(rolActivo,freq,addTaskVal)}
                    style={{ padding:'7px 14px', borderRadius:8, border:'none', background:ROLES[rolActivo].color, color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>+ Añadir</button>
                  <button onClick={()=>{setAddTask(null);setAddTaskVal('')}}
                    style={{ padding:'7px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontSize:12, cursor:'pointer' }}>✕</button>
                </div>
              )}
            </div>
          )
        })}

        {/* Notes */}
        <div style={{ marginTop:8 }}>
          <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:6 }}>Notas</p>
          <textarea value={semActual?.notas?.[rolActivo]??''} rows={2}
            onChange={e=>{ const n={...(semActual?.notas??{})}; n[rolActivo]=e.target.value; patchSem({notas:n}) }}
            placeholder="Bloqueos, observaciones..."
            style={{ width:'100%', background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', fontSize:12, color:T.onSurf, resize:'vertical', outline:'none', lineHeight:1.5 }} />
        </div>
      </div>

      {/* ── Historical ── */}
      {semanas.length>1 && (
        <div style={{ ...card, marginTop:14 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:10 }}>Historial de semanas</p>
          {semanas.map((s:any)=>{
            let d=0,t=0
            for(const r of Object.keys(ROLES) as RolKey[]){
              const rT=(s.tareas as any)?.[r]??{}
              for(const f of FREQS){const a:boolean[]=rT[f]??[];d+=a.filter(Boolean).length;t+=DEFAULT_TASKS[r]?.[f]?.length??0}
            }
            const pct=t>0?Math.round(d/t*100):0
            return (
              <div key={s.id} onClick={()=>setSemActual(s)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:`1px solid ${T.border}`, cursor:'pointer', opacity:s.id===semActual.id?1:.65 }}>
                <span style={{ fontSize:12, fontWeight:700, color:T.primary, minWidth:40 }}>#{s.semana}</span>
                <span style={{ fontSize:11, color:T.muted, flex:1 }}>{s.inicio} → {s.fin}</span>
                <div style={{ width:80, height:5, background:'rgba(255,255,255,0.07)', borderRadius:5, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:pct>=80?T.secondary:pct>=50?T.primary:T.tertiary, borderRadius:5 }}/>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:pct>=80?T.secondary:pct>=50?T.primary:T.tertiary, minWidth:32 }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── New week modal ── */}
      {semModal && <NewWeekModal onClose={()=>setSemModal(false)} onSave={async(s,i,f)=>{
        setSaving(true)
        const r=await fetch('/api/admin/seguimiento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({semana:parseInt(s),inicio:i,fin:f})})
        if(r.ok){await fetchSems();setSemModal(false)}
        setSaving(false)
      }} saving={saving} />}
    </div>
  )
}

// ── New week modal ─────────────────────────────────────────────
function NewWeekModal({ onClose, onSave, saving }: { onClose:()=>void; onSave:(s:string,i:string,f:string)=>void; saving:boolean }) {
  const [s,setS]=useState('');const [i,setI]=useState('');const [f,setF]=useState('')
  const now=new Date(), wn=now.toLocaleDateString('es',{month:'2-digit',day:'2-digit',year:'numeric'})
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#1C1B1B',borderRadius:20,padding:28,width:'100%',maxWidth:360,border:`1px solid rgba(255,255,255,0.11)` }}>
        <h3 style={{ color:'#fff',fontWeight:800,marginBottom:20,fontSize:18 }}>Nueva semana de seguimiento</h3>
        {[['Número de semana','number',s,setS,'22'],['Fecha inicio (dd/mm/aaaa)','text',i,setI,'02/06/2026'],['Fecha fin (dd/mm/aaaa)','text',f,setF,'06/06/2026']].map(([label,type,val,set,ph],ii)=>(
          <div key={ii} style={{ marginBottom:12 }}>
            <label style={{ fontSize:11,color:'#8B96A2',textTransform:'uppercase',letterSpacing:'0.08em',display:'block',marginBottom:4 }}>{label as string}</label>
            <input type={type as string} value={val as string} onChange={e=>(set as Function)(e.target.value)} placeholder={ph as string}
              style={{ width:'100%',background:'#201F1F',border:'none',borderRadius:10,padding:'9px 14px',fontSize:13,color:'#E5E2E1',outline:'none' }} />
          </div>
        ))}
        <div style={{ display:'flex',gap:10,marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1,padding:'10px',borderRadius:10,border:`1px solid rgba(255,255,255,0.07)`,background:'transparent',color:'#8B96A2',fontSize:13,cursor:'pointer' }}>Cancelar</button>
          <button disabled={saving||!s||!i||!f} onClick={()=>onSave(s,i,f)}
            style={{ flex:2,padding:'10px',borderRadius:10,border:'none',background:'#7C3AED',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving||!s||!i||!f?.5:1 }}>
            {saving?'Creando...':'✓ Crear semana'}
          </button>
        </div>
      </div>
    </div>
  )
}
