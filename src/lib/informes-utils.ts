import { parseISO, getHours, getDate, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CitaConRelaciones } from '@/types/database'

// ---- TYPES ----

export interface CitasPorHora {
  hora: string
  horaNum: number
  total: number
}

export interface CitasPorDiaSemana {
  dia: string
  diaNum: number
  total: number
}

export interface CitasPorSemana {
  semana: string
  semanaNum: number
  total: number
}

export interface IngresosPorDia {
  fecha: string
  efectivo: number
  mercadopago: number
  total: number
}

export interface ServicioStats {
  nombre: string
  cantidad: number
  ingresos: number
}

export interface ProfesionalStats {
  nombre: string
  color: string
  totalCitas: number
  completadas: number
  noAsistio: number
  ingresos: number
}

export interface Resumen {
  totalCitas: number
  completadas: number
  noAsistio: number
  ingresos: number
  efectivo: number
  mercadopago: number
  ticketPromedio: number
}

// ---- FUNCTIONS ----

export function calcularCitasPorHora(citas: CitaConRelaciones[]): CitasPorHora[] {
  const counts: Record<number, number> = {}
  for (let h = 8; h <= 20; h++) counts[h] = 0

  for (const cita of citas) {
    const h = getHours(parseISO(cita.fecha_inicio))
    if (h >= 8 && h <= 20) {
      counts[h] = (counts[h] || 0) + 1
    }
  }

  return Object.entries(counts).map(([h, total]) => ({
    hora: `${h}:00`,
    horaNum: Number(h),
    total,
  }))
}

export function calcularCitasPorDiaSemana(citas: CitaConRelaciones[]): CitasPorDiaSemana[] {
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const counts: Record<number, number> = {}
  for (let d = 0; d <= 6; d++) counts[d] = 0

  for (const cita of citas) {
    const d = parseISO(cita.fecha_inicio).getDay()
    counts[d] = (counts[d] || 0) + 1
  }

  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    dia: dias[d],
    diaNum: d,
    total: counts[d] || 0,
  }))
}

export function calcularCitasPorSemana(citas: CitaConRelaciones[]): CitasPorSemana[] {
  const counts: Record<number, number> = {}

  for (const cita of citas) {
    const dayOfMonth = getDate(parseISO(cita.fecha_inicio))
    const weekNum = Math.ceil(dayOfMonth / 7)
    counts[weekNum] = (counts[weekNum] || 0) + 1
  }

  return [1, 2, 3, 4, 5]
    .map((w) => ({
      semana: `Semana ${w}`,
      semanaNum: w,
      total: counts[w] || 0,
    }))
    .filter((w) => w.total > 0 || w.semanaNum <= 4)
}

export function calcularIngresosPorDia(citas: CitaConRelaciones[]): IngresosPorDia[] {
  const completadas = citas.filter((c) => c.status === 'completada' && c.precio_cobrado)
  const map = new Map<string, { efectivo: number; mercadopago: number }>()

  for (const cita of completadas) {
    const fecha = format(parseISO(cita.fecha_inicio), 'dd/MM', { locale: es })
    const entry = map.get(fecha) || { efectivo: 0, mercadopago: 0 }
    const monto = cita.precio_cobrado || 0
    if (cita.metodo_pago === 'efectivo') {
      entry.efectivo += monto
    } else {
      // mercadopago + transferencia van juntos
      entry.mercadopago += monto
    }
    map.set(fecha, entry)
  }

  return Array.from(map.entries()).map(([fecha, vals]) => ({
    fecha,
    efectivo: vals.efectivo,
    mercadopago: vals.mercadopago,
    total: vals.efectivo + vals.mercadopago,
  }))
}

export function calcularServicioStats(citas: CitaConRelaciones[]): ServicioStats[] {
  const map = new Map<string, { nombre: string; cantidad: number; ingresos: number }>()

  for (const cita of citas) {
    const nombre = cita.servicios?.nombre || 'Sin servicio'
    const entry = map.get(nombre) || { nombre, cantidad: 0, ingresos: 0 }
    entry.cantidad += 1
    if (cita.status === 'completada' && cita.precio_cobrado) {
      entry.ingresos += cita.precio_cobrado
    }
    map.set(nombre, entry)
  }

  return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad)
}

export function calcularProfesionalStats(citas: CitaConRelaciones[]): ProfesionalStats[] {
  const map = new Map<
    string,
    { nombre: string; color: string; totalCitas: number; completadas: number; noAsistio: number; ingresos: number }
  >()

  for (const cita of citas) {
    const nombre = cita.profesionales?.nombre || 'Sin profesional'
    const color = cita.profesionales?.color || '#6366f1'
    const entry = map.get(nombre) || { nombre, color, totalCitas: 0, completadas: 0, noAsistio: 0, ingresos: 0 }
    entry.totalCitas += 1
    if (cita.status === 'completada') {
      entry.completadas += 1
      if (cita.precio_cobrado) entry.ingresos += cita.precio_cobrado
    }
    if (cita.status === 'no_asistio') {
      entry.noAsistio += 1
    }
    map.set(nombre, entry)
  }

  return Array.from(map.values()).sort((a, b) => b.totalCitas - a.totalCitas)
}

export function calcularResumen(citas: CitaConRelaciones[]): Resumen {
  let completadas = 0
  let noAsistio = 0
  let efectivo = 0
  let mercadopago = 0

  for (const cita of citas) {
    if (cita.status === 'completada') {
      completadas += 1
      const monto = cita.precio_cobrado || 0
      if (cita.metodo_pago === 'efectivo') {
        efectivo += monto
      } else {
        // mercadopago + transferencia van juntos
        mercadopago += monto
      }
    }
    if (cita.status === 'no_asistio') noAsistio += 1
  }

  const ingresos = efectivo + mercadopago
  const ticketPromedio = completadas > 0 ? ingresos / completadas : 0

  return {
    totalCitas: citas.length,
    completadas,
    noAsistio,
    ingresos,
    efectivo,
    mercadopago,
    ticketPromedio,
  }
}
