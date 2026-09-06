import { format, parseISO, addMinutes, isBefore, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatAR } from '@/lib/timezone'

// Todas las funciones de formateo delegan a formatAR (hora Argentina fija).
// Antes usaban date-fns format() sin TZ, que mostraba en la TZ del dispositivo:
// un cliente con el celular en UTC veia horas corridas 3hs. Ahora es siempre AR.

export function formatFecha(date: string | Date): string {
  return formatAR(date, "d 'de' MMMM, yyyy")
}

export function formatHora(date: string | Date): string {
  return formatAR(date, 'HH:mm')
}

export function formatFechaCorta(date: string | Date): string {
  return formatAR(date, 'dd/MM/yyyy')
}

export function formatFechaHora(date: string | Date): string {
  return formatAR(date, "d 'de' MMMM, HH:mm")
}

export function formatPrecio(precio: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(precio)
}

/**
 * Combina una fecha + "HH:mm" usando setHours (hora LOCAL del runtime).
 *
 * IMPORTANTE: usar solo en client components. El navegador del usuario está
 * en AR (UTC-3), por lo que el resultado es correcto. Si se llama desde código
 * server-side (Vercel runs in UTC), las horas quedan corridas 3hs.
 *
 * Para uso server-side, usar `parseTimeToDateAR` en src/lib/timezone.ts.
 */
export function parseTimeToDate(fecha: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date(fecha)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function getStartOfDay(date: Date): Date {
  return startOfDay(date)
}

export function getEndOfDay(date: Date): Date {
  return endOfDay(date)
}

/** Capitaliza la primera letra de cada palabra (igual que INITCAP en PostgreSQL) */
export function capitalizeWords(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export { addMinutes, isBefore, parseISO, format }
