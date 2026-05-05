export const CLIENTES = [
  'ARü',
  'Coondor',
  'Crusso',
  'Fresitas la Playita',
  'Groi',
  'Molicie',
  'Versla',
  'Visuality',
]

// Maps client name → env var key
export const CLIENT_PIN_MAP: Record<string, string> = {
  'ARü':                 'PIN_ARU',
  'Coondor':             'PIN_COONDOR',
  'Crusso':              'PIN_CRUSSO',
  'Fresitas la Playita': 'PIN_FRESITAS',
  'Groi':                'PIN_GROI',
  'Molicie':             'PIN_MOLICIE',
  'Versla':              'PIN_VERSLA',
  'Visuality':           'PIN_VISUALITY',
}

export const TIPOS = [
  'Contenido nuevo',
  'Pauta / ads',
  'Diseño',
  'Reunión / llamada',
  'Revisión / corrección',
]

export const URGENCIAS = [
  { value: 'baja',  label: '🟢 Baja — sin afán' },
  { value: 'media', label: '🟡 Media — esta semana' },
  { value: 'alta',  label: '🔴 Alta — lo antes posible' },
]

export const PERFILES = [
  'Diseño',
  'Contenido',
  'Pauta / Ads',
  'Video',
  'Web',
  'Estrategia',
]

export const EQUIPO = [
  'Camila',
  'Daniel',
  'Sebastián',
  'Valeria',
  'Mateo',
  'Laura',
]

export const ESTADOS = [
  { value: 'pendiente',   label: 'Pendiente',   color: '#E91E8C' },
  { value: 'en_proceso',  label: 'En proceso',  color: '#7B00D4' },
  { value: 'completada',  label: 'Completada',  color: '#16a34a' },
]

// ── Asignación automática por tipo de solicitud ───────────────
// Editar aquí para cambiar quién recibe cada tipo
export const ASIGNACION: Record<string, string> = {
  'Contenido nuevo':       'Equipo',
  'Pauta / ads':           'Equipo',
  'Diseño':                'Equipo',
  'Reunión / llamada':     'Equipo',
  'Revisión / corrección': 'Equipo',
}

// ── Presupuesto mensual por cliente (COP) ──────────────────────
// Editar aquí cuando cambie el plan de un cliente
export const PRESUPUESTO_CLIENTES: Record<string, number> = {
  'ARü':                 1_990_000,
  'Coondor':               700_000,
  'Crusso':              2_000_000,
  'Fresitas la Playita':   700_000,
  'Groi':                1_990_000,
  'Molicie':             1_990_000,
  'Versla':              1_990_000,
  'Visuality':           1_990_000,
}

// ── Costo estimado por tipo de solicitud (COP) ─────────────────
export const COSTO_TIPO: Record<string, number> = {
  'Contenido nuevo':      1_500_000,   // parrilla mensual completa
  'Pauta / ads':            300_000,
  'Diseño':                 100_000,
  'Reunión / llamada':       60_000,
  'Revisión / corrección':   50_000,
}
