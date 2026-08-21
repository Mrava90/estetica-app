/**
 * Normaliza un número de teléfono argentino a formato canónico "11xxxxxxxx".
 *
 * Acepta y unifica los distintos formatos comunes:
 *   +54 9 11 xxxx-xxxx  → 11xxxxxxxx
 *   549 11 xxxx-xxxx    → 11xxxxxxxx
 *   54 11 xxxx-xxxx     → 11xxxxxxxx
 *   15 xxxx-xxxx        → 11xxxxxxxx
 *   xxxx xxxx (8 díg)   → 11xxxxxxxx
 *
 * Devuelve solo dígitos. Si el input está vacío o inválido, devuelve string vacío.
 */
export function normalizarTelefono(tel: string | null | undefined): string {
  if (!tel) return ''
  let t = String(tel).trim().replace(/\D/g, '')
  if (!t) return ''

  if (t.startsWith('5491')) t = t.slice(4)
  else if (t.startsWith('549')) t = t.slice(3)
  else if (t.startsWith('54')) t = t.slice(2)

  if (t.startsWith('15')) t = '11' + t.slice(2)
  if (!t.startsWith('11') && t.length === 8) t = '11' + t

  return t
}
