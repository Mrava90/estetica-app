/**
 * Helpers de timezone para Argentina (UTC-3, sin horario de verano desde 2009).
 *
 * Usar SIEMPRE estas funciones para mostrar fechas en hora AR, especialmente
 * en código server-side (API routes, crons) que corre en UTC en Vercel.
 */

import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'

export const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Formatea una fecha (string ISO o Date) en hora AR.
 * Ejemplo: formatAR('2026-04-21T14:30:00Z', 'dd/MM/yyyy HH:mm') → '21/04/2026 11:30'
 */
export function formatAR(date: Date | string, pattern: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, AR_TZ, pattern, { locale: es })
}

/**
 * Convierte una fecha (UTC o cualquier zona) a objeto Date que representa hora AR.
 * Útil para usar getDay/getHours/etc en hora local AR.
 */
export function toAR(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  return toZonedTime(d, AR_TZ)
}

/**
 * Fecha en formato 'YYYY-MM-DD' en hora AR.
 */
export function fechaArYMD(date: Date | string = new Date()): string {
  return formatAR(date, 'yyyy-MM-dd')
}

/**
 * Día de la semana en hora AR (0=domingo, 1=lunes, ..., 6=sábado).
 */
export function diaSemanaAR(date: Date | string = new Date()): number {
  return toAR(date).getDay()
}

/**
 * Texto amigable de fecha+hora AR. Ej: "martes 21 de abril a las 12:30"
 */
export function formatFechaHoraAR(date: Date | string): string {
  return formatAR(date, "EEEE d 'de' MMMM 'a las' HH:mm")
}

/**
 * Combina una fecha + "HH:mm" interpretando la hora como hora AR (UTC-3).
 * Retorna un Date que representa ese momento en UTC, útil para guardar/comparar.
 *
 * Usar esta función desde código server-side (API routes, crons) en vez de
 * `parseTimeToDate` que usa hora local del runtime.
 */
export function parseTimeToDateAR(fecha: Date | string, timeStr: string): Date {
  const baseDate = typeof fecha === 'string' ? fecha.slice(0, 10) : formatAR(fecha, 'yyyy-MM-dd')
  // ISO con offset AR: la hora indicada se interpreta como AR (UTC-3)
  return new Date(`${baseDate}T${timeStr}:00-03:00`)
}
