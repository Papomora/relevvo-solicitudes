'use client'

// ── Report manifest — updated each time a report is generated ──────
// To add a new report: add an entry to the client's array and redeploy.
type ReportEntry = {
  periodo: string
  fecha: string
  file: string
  plataformas: string[]
  notas?: string
}

const REPORTES: Record<string, ReportEntry[]> = {
  'Crusso': [
    { periodo: 'Marzo 2026', fecha: '2026-03-31', file: '/reportes/crusso_marzo2026.html', plataformas: ['Facebook', 'Instagram'], notas: 'FB viz 995K ↑39.7% · IG alcance 136K ↑61.2% · Orgánico IG 9.1%' },
    { periodo: 'Abril 2026', fecha: '2026-04-30', file: '/reportes/crusso_abril2026.html', plataformas: ['Facebook', 'Instagram'], notas: 'FB interacciones +147% · IG alcance orgánico 9.6%' },
  ],
  'ARü': [],
  'Coondor': [],
  'Fresitas la Playita': [],
  'Groi': [],
  'Molicie': [
    { periodo: 'Marzo 2026', fecha: '2026-03-31', file: '/reportes/molicie_marzo2026.html', plataformas: ['Facebook', 'Instagram'], notas: 'FB viz 277K ↑38% · IG alcance 32K ↓20% · Interacciones IG -21%' },
    { periodo: 'Abril 2026', fecha: '2026-04-30', file: '/reportes/molicie_abril2026.html', plataformas: ['Facebook', 'Instagram'], notas: 'FB viz 592K ↑120% · IG alcance 54K ↑75% · Mejor mes del año' },
  ],
  'Versla': [],
  'Visuality': [],
}

const PLATFORM_COLORS: Record<string, string> = {
  'Facebook':  '#1877F2',
  'Instagram': '#E91E8C',
  'TikTok':    '#000',
}

const CLIENT_EMOJI: Record<string, string> = {
  'Crusso': '🪑', 'ARü': '💎', 'Coondor': '🦅', 'Fresitas la Playita': '🍓',
  'Groi': '🌱', 'Molicie': '☁️', 'Versla': '👗', 'Visuality': '🎥',
}

export default function MetaReportesPage() {
  const T = {
    bg: '#0A0A0A', card: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)',
    muted: '#6B7280', primary: '#D2BBFF', surface: '#141414', text: '#E5E2E1',
  }

  const clientes = Object.keys(REPORTES)
  const totalReportes = Object.values(REPORTES).reduce((a, r) => a + r.length, 0)
  const clientesActivos = Object.values(REPORTES).filter(r => r.length > 0).length

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Inter', system-ui, sans-serif", color: T.text }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,14,14,0.95)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${T.border}`, padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/admin" style={{ color: T.muted, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Admin</a>
          <span style={{ color: T.border }}>·</span>
          <div>
            <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em' }}>Relevvo Studio</p>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-.03em', lineHeight: 1.1 }}>Reportes Meta</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{totalReportes}</div>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Reportes</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{clientesActivos}</div>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Clientes</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px' }}>

        {/* Workflow banner */}
        <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(14,165,233,0.08))', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 16, padding: '20px 28px', marginBottom: 36, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>¿Cómo generar un reporte?</p>
            <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
              Sube los pantallazos de Meta Business Suite al chat de Claude → él extrae los datos automáticamente → el reporte HTML aparece aquí categorizado por cliente.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {['📸 Sube pantallazo', '→', '🤖 Claude extrae', '→', '📊 Reporte listo', '→', '📧 Envía al cliente'].map((s, i) => (
              s === '→'
                ? <span key={i} style={{ color: T.muted, fontSize: 16 }}>→</span>
                : <span key={i} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Client grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {clientes.map(cliente => {
            const reportes = REPORTES[cliente]
            const hasReports = reportes.length > 0
            const ultimo = reportes[reportes.length - 1]

            return (
              <div key={cliente} style={{
                background: T.card, border: `1px solid ${hasReports ? 'rgba(124,58,237,0.35)' : T.border}`,
                borderRadius: 16, overflow: 'hidden',
                boxShadow: hasReports ? '0 0 24px rgba(124,58,237,0.08)' : 'none',
                transition: 'all .2s',
              }}>
                {/* Card header */}
                <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 26 }}>{CLIENT_EMOJI[cliente] ?? '📌'}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{cliente}</div>
                      {hasReports
                        ? <div style={{ fontSize: 11, color: '#A78BFA', fontWeight: 600, marginTop: 2 }}>Último: {ultimo.periodo}</div>
                        : <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Sin reportes aún</div>
                      }
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: hasReports ? '#fff' : T.muted }}>
                    {reportes.length}
                    <span style={{ fontSize: 11, color: T.muted, fontWeight: 400, marginLeft: 4 }}>mes{reportes.length !== 1 ? 'es' : ''}</span>
                  </div>
                </div>

                {/* Reports list */}
                <div style={{ padding: '14px 22px' }}>
                  {hasReports ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[...reportes].reverse().map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{r.periodo}</div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                              {r.plataformas.map(p => (
                                <span key={p} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: PLATFORM_COLORS[p] ?? '#444', color: '#fff' }}>{p}</span>
                              ))}
                            </div>
                            {r.notas && <div style={{ fontSize: 11, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{r.notas}</div>}
                          </div>
                          <a
                            href={r.file} target="_blank" rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7C3AED,#A78BFA)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                          >
                            Ver ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 12, color: T.muted }}>
                      <span style={{ fontSize: 28 }}>📭</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Sin reportes generados</div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>Sube el pantallazo de Meta en el chat</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
