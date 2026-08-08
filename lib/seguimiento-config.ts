// ── Roles config — tareas por frecuencia + clientes ──────────
// Sincronizado con relevvo_dashboard_seguimiento.md

export const ROLES_CONFIG = {
  editora: {
    label: 'Editora de video',
    total: 8,
    tareas: {
      // Diario: 3 tareas × 5 días = 15 entregas/sem (contadas como 1 checkbox diario)
      diario:    [
        '3 videos editados para Molicie (×3 diarios — día completo)',
        'Revisión y ajuste según feedback del director',
        'Organización de archivos en carpeta del cliente',
      ],
      semanal:   [
        '1 video de alta complejidad completado (×1/sem)',
        'Revisión de backlog de pendientes',
      ],
      quincenal: ['Reporte de producción: videos entregados vs planeados'],
      mensual:   [
        'Balance de producción audiovisual del mes',
        'Propuesta de mejoras en flujo editorial',
      ],
    },
  },
  cm: {
    label: 'Community Manager',
    total: 10,
    tareas: {
      diario:    [
        'Publicar contenido según parrilla de cada cliente',
        'Monitoreo de comentarios e interacciones',
        'Generar imágenes para piezas del día',
      ],
      semanal:   [
        'Entrega parrilla semana siguiente (contenido + imágenes) — lunes',
        'Reporte de engagement básico por cliente',
      ],
      quincenal: ['Revisión de tono y consistencia de marca por cliente'],
      mensual:   [
        '12 posts + historias Crusso ✓ (parrilla mensual completa)',
        '12 posts + historias Molicie ✓ (parrilla mensual completa)',
        '10 publicaciones Groi — 4 cuentas integradas ✓',
        'Análisis de mejores y peores piezas del mes',
      ],
    },
  },
  director: {
    label: 'Director creativo',
    total: 8,
    tareas: {
      diario:    [
        'Revisión y aprobación de piezas en producción',
        'Diseño de piezas sociales asignadas al día',
        'Respuesta a bloqueos o dudas del equipo',
      ],
      semanal:   [
        'Revisión y aprobación de parrilla CM — martes',
        '1 video alta dificultad producido o en avance',
        'Reunión con clientes activos (WhatsApp check-in)',
      ],
      quincenal: [
        'Revisión del estado de cumplimiento del equipo',
        'Ajuste de prioridades y asignaciones según carga',
      ],
      mensual:   [
        'Revisión estratégica: Crusso, Molicie, Groi',
        'Actualización del plan de contenido por cliente',
        'Evaluación de desempeño interno del equipo',
      ],
    },
  },
  miguel: {
    label: 'Miguel · Trafficker',
    total: 5,
    tareas: {
      diario:    [
        'Revisión de métricas de campañas activas (Crusso + Molicie + Groi)',
        'Ajuste de presupuesto si hay alarmas de rendimiento',
      ],
      semanal:   [
        'Reporte semanal (ROAS, CPA, alcance) — viernes',
        'Revisión de creativos en pauta vs disponibles',
        'Propuesta de mejoras o cambios de targeting',
      ],
      quincenal: [
        'Revisión de presupuesto quincenal por cliente',
        'Análisis comparativo de rendimiento de campañas',
      ],
      mensual:   [
        'Informe de tráfico pago mensual: Crusso · Molicie · Groi',
        'Planificación de campañas del mes siguiente',
        'Control límite 3 campañas/mes por cliente (máx 9 total)',
      ],
    },
  },
} as const

export type RolKey = keyof typeof ROLES_CONFIG

export const FRECUENCIAS = ['diario', 'semanal', 'quincenal', 'mensual'] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]

// ── Helpers ───────────────────────────────────────────────────

export function calcProgreso(tareas: any, rol: RolKey): { done: number; total: number; pct: number } {
  const cfg   = ROLES_CONFIG[rol]
  const rTar  = (tareas as any)?.[rol] ?? {}
  let done    = 0
  let total   = 0
  for (const freq of FRECUENCIAS) {
    const lista = (rTar[freq] as boolean[]) ?? []
    done  += lista.filter(Boolean).length
    total += (cfg.tareas as any)[freq].length
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

export function buildMsgInicioSemana(
  nombre: string,
  rol: RolKey,
  semana: number,
  inicio: string,
  fin: string
): string {
  const cfg = ROLES_CONFIG[rol]
  const lineas: string[] = []
  lineas.push(`👋 Hola ${nombre}!\n`)
  lineas.push(`📅 *Semana #${semana} · ${inicio} → ${fin}*\n`)
  lineas.push(`Tus tareas de esta semana:\n`)
  const emojis: Record<string, string> = { diario:'🔁', semanal:'📋', quincenal:'📆', mensual:'🗓️' }
  const labels: Record<string, string> = { diario:'DIARIO', semanal:'SEMANAL', quincenal:'QUINCENAL', mensual:'MENSUAL' }
  for (const freq of FRECUENCIAS) {
    const items = (cfg.tareas as any)[freq] as string[]
    if (!items.length) continue
    lineas.push(`${emojis[freq]} *${labels[freq]}*`)
    items.forEach(t => lineas.push(`• ${t}`))
    lineas.push('')
  }
  lineas.push(`Marca tus avances en el panel 💪`)
  lineas.push(`🔗 solicitudes.relevvostudio.com/admin`)
  return lineas.join('\n')
}

export function buildMsgRecordatorio(nombre: string, rol: RolKey, semana: number, tareas: any): string {
  const { done, total, pct } = calcProgreso(tareas, rol)
  const barra = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  return (
    `📊 *Recordatorio Semana #${semana}*\n\n` +
    `Hola ${nombre} 👋\n\n` +
    `Tu avance actual:\n${barra} ${pct}% (${done}/${total} tareas)\n\n` +
    `Si tienes tareas pendientes, márcalas en el panel:\n🔗 solicitudes.relevvostudio.com/admin`
  )
}

export function buildMsgCierreSemana(semana: number, tareas: any): string {
  const roles = Object.keys(ROLES_CONFIG) as RolKey[]
  let totalDone = 0, totalAll = 0
  const lineas: string[] = []
  lineas.push(`✅ *Cierre Semana #${semana} — Relevvo*\n`)
  lineas.push(`📊 Resultados del equipo:\n`)
  for (const rol of roles) {
    const { done, total, pct } = calcProgreso(tareas, rol)
    lineas.push(`• ${ROLES_CONFIG[rol].label.split(' ')[0]}: ${done}/${total} (${pct}%)`)
    totalDone += done; totalAll += total
  }
  const tPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0
  lineas.push(`\n🏆 *Total equipo: ${totalDone}/${totalAll} (${tPct}%)*`)
  lineas.push(`¡Buen trabajo equipo! 💜`)
  return lineas.join('\n')
}
