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

interface BloqueoExistente {
  fecha_inicio: string
  fecha_fin: string
}

export function calcularSlotsDisponibles(
  fecha: Date,
  horario: HorarioDelDia | null,
  citasExistentes: CitaExistente[],
  duracionServicio: number,
  intervalo: number = 30,
  bloqueos: BloqueoExistente[] = []
): SlotDisponible[] {
  if (!horario) return []

  const inicioJornada = parseTimeToDate(fecha, horario.hora_inicio)
  const finJornada = parseTimeToDate(fecha, horario.hora_fin)
  const ahora = new Date()

  // Combine citas and bloqueos into one occupied list
  const ocupados = [
    ...citasExistentes.map((c) => ({ inicio: new Date(c.fecha_inicio), fin: new Date(c.fecha_fin) })),
    ...bloqueos.map((b) => ({ inicio: new Date(b.fecha_inicio), fin: new Date(b.fecha_fin) })),
  ]

  const slots: SlotDisponible[] = []
  let cursor = inicioJornada

  while (addMinutes(cursor, duracionServicio) <= finJornada) {
    const slotFin = addMinutes(cursor, duracionServicio)

    const hayConflicto = ocupados.some((occ) => cursor < occ.fin && slotFin > occ.inicio)
    const enPasado = isBefore(cursor, ahora)

    if (!hayConflicto && !enPasado) {
      slots.push({ inicio: new Date(cursor), fin: new Date(slotFin) })
    }

    cursor = addMinutes(cursor, intervalo)
  }

  return slots
}
