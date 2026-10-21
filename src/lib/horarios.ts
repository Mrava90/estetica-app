/**
 * Horario de trabajo de una profesional para una fecha concreta.
 *
 * Fuentes, en orden:
 *   1. horarios_especiales (migracion 00048): si algun periodo cubre la fecha
 *      (y el dia de la semana, si se limito), REEMPLAZA al horario semanal.
 *      Una fila sin hora = ese dia no trabaja.
 *   2. horarios (semanal): el de siempre, segun el dia de la semana.
 * Los desbloqueos de la fecha NO entran aca: cada pantalla los sigue sumando
 * por encima, como antes.
 *
 * Lo usan la reserva online, la validacion al reservar, el aviso al cargar un
 * turno a mano y el calendario. Si la tabla de especiales no existe o falla,
 * se pasa una lista vacia y todo sigue con el horario semanal.
 */

export interface HorarioEspecial {
  id?: string
  profesional_id: string
  fecha_desde: string          // YYYY-MM-DD
  fecha_hasta: string          // YYYY-MM-DD
  dias_semana: number[] | null // 0=Dom..6=Sab; null/vacio = todos
  hora_inicio: string | null   // null = no trabaja
  hora_fin: string | null
  motivo?: string | null
}

export interface HorarioSemanal {
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  activo?: boolean
}

export interface Tramo {
  hora_inicio: string
  hora_fin: string
}

/** Columnas a pedir de horarios_especiales. */
export const COLUMNAS_ESPECIALES = 'id, profesional_id, fecha_desde, fecha_hasta, dias_semana, hora_inicio, hora_fin, motivo'

/** Periodos especiales que aplican a esa fecha (y dia de la semana). */
export function especialesDelDia(fechaYMD: string, diaSemana: number, especiales: HorarioEspecial[]): HorarioEspecial[] {
  return especiales.filter(e =>
    fechaYMD >= e.fecha_desde &&
    fechaYMD <= e.fecha_hasta &&
    (!e.dias_semana || e.dias_semana.length === 0 || e.dias_semana.includes(diaSemana)))
}

/**
 * Tramos de trabajo de UNA profesional en una fecha (sin desbloqueos).
 * `especial` = true si el dia lo define un horario especial (aunque sea
 * "no trabaja"), para poder mostrarlo distinto.
 */
export function tramosDelDia(
  fechaYMD: string,
  diaSemana: number,
  semanales: HorarioSemanal[],
  especiales: HorarioEspecial[],
): { tramos: Tramo[]; especial: boolean } {
  const aplican = especialesDelDia(fechaYMD, diaSemana, especiales)
  if (aplican.length > 0) {
    return {
      especial: true,
      tramos: aplican
        .filter(e => e.hora_inicio && e.hora_fin)
        .map(e => ({ hora_inicio: e.hora_inicio!, hora_fin: e.hora_fin! }))
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    }
  }
  return {
    especial: false,
    tramos: semanales
      .filter(h => h.dia_semana === diaSemana && h.activo !== false)
      .map(h => ({ hora_inicio: h.hora_inicio, hora_fin: h.hora_fin }))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
  }
}
