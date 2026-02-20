import { addMinutes, isBefore } from 'date-fns'
import { parseTimeToDate } from './dates'

export interface SlotDisponible {
  inicio: Date
  fin: Date
}

interface CitaExistente {
  fecha_inicio: string
  fecha_fin: string
}

interface HorarioDelDia {
  hora_inicio: string
  hora_fin: string
}

export function calcularSlotsDisponibles(
  fecha: Date,
  horario: HorarioDelDia | null,
  citasExistentes: CitaExistente[],
  duracionServicio: number,
  intervalo: number = 30
): SlotDisponible[] {
  if (!horario) return []

  const inicioJornada = parseTimeToDate(fecha, horario.hora_inicio)
  const finJornada = parseTimeToDate(fecha, horario.hora_fin)
  const ahora = new Date()

  const slots: SlotDisponible[] = []
  let cursor = inicioJornada

  while (addMinutes(cursor, duracionServicio) <= finJornada) {
    const slotFin = addMinutes(cursor, duracionServicio)

    const hayConflicto = citasExistentes.some((cita) => {
      const citaInicio = new Date(cita.fecha_inicio)
      const citaFin = new Date(cita.fecha_fin)
      return cursor < citaFin && slotFin > citaInicio
    })

    const enPasado = isBefore(cursor, ahora)

    if (!hayConflicto && !enPasado) {
      slots.push({ inicio: new Date(cursor), fin: new Date(slotFin) })
    }

    cursor = addMinutes(cursor, intervalo)
  }

  return slots
}
