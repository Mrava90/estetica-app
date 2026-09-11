/**
 * Helpers de presentacion de la pantalla de facturacion.
 * Solo formateo — nada de estado ni de fetch.
 */

export function mesLabel(d: Date) {
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function initials(nombre: string) {
  const parts = nombre.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

export function formatDNI(dni: string) {
  const n = dni.replace(/\D/g, '')
  if (n.length === 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`
  if (n.length === 7) return `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`
  return dni
}

const AVATAR_COLORS = [
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
]

export function avatarColor(nombre: string) {
  return AVATAR_COLORS[nombre.charCodeAt(0) % AVATAR_COLORS.length]
}
