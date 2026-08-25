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
  bloqueos: BloqueoExistente[] = [],
  toleranciaSolapamientoMin: number = 0,
): SlotDisponible[] {
  if (!horario) return []

  const inicioJornada = parseTimeToDate(fecha, horario.hora_inicio)
  const finJornada = parseTimeToDate(fecha, horario.hora_fin)
  const ahora = new Date()
  const toleranciaMs = Math.max(0, toleranciaSolapamientoMin) * 60_000

  // Citas: aplican tolerancia. Bloqueos: NO (bloqueo es bloqueo, no se pisa).
  const citasOcup = citasExistentes.map((c) => ({ inicio: new Date(c.fecha_inicio), fin: new Date(c.fecha_fin) }))
  const bloqueosOcup = bloqueos.map((b) => ({ inicio: new Date(b.fecha_inicio), fin: new Date(b.fecha_fin) }))

  const slots: SlotDisponible[] = []
  let cursor = inicioJornada

  while (addMinutes(cursor, duracionServicio) <= finJornada) {
    const slotFin = addMinutes(cursor, duracionServicio)

    // Conflicto con citas = la superposición TOTAL acumulada supera la tolerancia.
    // Sumamos overlaps con todas las citas para evitar que un slot se "meta" entre dos
    // turnos y pise X min de cada uno (sumando 2X de overlap real).
    const overlapTotalMs = citasOcup.reduce((acc, occ) => {
      const overlap = Math.max(0, Math.min(slotFin.getTime(), occ.fin.getTime()) - Math.max(cursor.getTime(), occ.inicio.getTime()))
      return acc + overlap
    }, 0)
    const conflictoCita = overlapTotalMs > toleranciaMs
    // Conflicto con bloqueo = cualquier superposición.
    const conflictoBloqueo = bloqueosOcup.some((occ) => cursor < occ.fin && slotFin > occ.inicio)
    const enPasado = isBefore(cursor, ahora)

    if (!conflictoCita && !conflictoBloqueo && !enPasado) {
      slots.push({ inicio: new Date(cursor), fin: new Date(slotFin) })
    }

    cursor = addMinutes(cursor, intervalo)
  }

  return slots
}
