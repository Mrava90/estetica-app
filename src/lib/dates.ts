import { format, parseISO, addMinutes, isBefore, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatFecha(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "d 'de' MMMM, yyyy", { locale: es })
}

export function formatHora(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'HH:mm', { locale: es })
}

export function formatFechaCorta(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy', { locale: es })
}

export function formatFechaHora(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "d 'de' MMMM, HH:mm", { locale: es })
}

export function formatPrecio(precio: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(precio)
}

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

export { addMinutes, isBefore, parseISO, format }
