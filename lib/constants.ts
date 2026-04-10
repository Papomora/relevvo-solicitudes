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

export const ESTADOS = [
  { value: 'pendiente',   label: 'Pendiente',   color: '#E91E8C' },
  { value: 'en_proceso',  label: 'En proceso',  color: '#7B00D4' },
  { value: 'completada',  label: 'Completada',  color: '#16a34a' },
]
