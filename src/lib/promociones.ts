import type { Promocion, Servicio } from '@/types/database'
import { toAR, diaSemanaAR, fechaArYMD } from './timezone'

/**
 * Verifica si una promoción aplica a una cita específica.
 * Considera: día de la semana AR, franja horaria AR, vigencia por fechas,
 * lista de servicios y profesionales.
 */
export function promoAplica(
  promo: Promocion,
  args: {
    fechaInicio: Date | string
    servicioId: string
    profesionalId: string | null
    metodoPago?: string | null   // si la promo requiere método específico, comparar
  }
): boolean {
  if (!promo.activa) return false

  // Método de pago requerido (ej: "solo efectivo")
  if (promo.metodo_pago_requerido) {
    if (!args.metodoPago || args.metodoPago !== promo.metodo_pago_requerido) return false
  }

  // Si tiene precios_override, el servicio debe estar en el override (o en servicios_ids si están definidos)
  if (promo.precios_override && Object.keys(promo.precios_override).length > 0) {
    if (!(args.servicioId in promo.precios_override)) return false
  }

  const fechaAR = toAR(args.fechaInicio)
  const dateStr = fechaArYMD(args.fechaInicio)

  // Fechas de vigencia
  if (promo.fecha_desde && dateStr < promo.fecha_desde) return false
  if (promo.fecha_hasta && dateStr > promo.fecha_hasta) return false

  // Día de la semana (0=domingo, 6=sábado)
  if (promo.dias_semana && promo.dias_semana.length > 0) {
    const dia = diaSemanaAR(args.fechaInicio)
    if (!promo.dias_semana.includes(dia)) return false
  }

  // Franja horaria
  if (promo.hora_desde || promo.hora_hasta) {
    const horaMin = fechaAR.getHours() * 60 + fechaAR.getMinutes()
    if (promo.hora_desde) {
      const [h, m] = promo.hora_desde.split(':').map(Number)
      if (horaMin < h * 60 + m) return false
    }
    if (promo.hora_hasta) {
      const [h, m] = promo.hora_hasta.split(':').map(Number)
      if (horaMin >= h * 60 + m) return false
    }
  }

  // Servicios (null=todos)
  if (promo.servicios_ids && promo.servicios_ids.length > 0) {
    if (!promo.servicios_ids.includes(args.servicioId)) return false
  }

  // Profesionales (null=todos)
  if (promo.profesionales_ids && promo.profesionales_ids.length > 0) {
    if (!args.profesionalId || !promo.profesionales_ids.includes(args.profesionalId)) return false
  }

  return true
}

/**
 * Calcula el precio con la mejor promo aplicable.
 * Si varias promos matchean, se aplica la que dé mayor descuento.
 * Devuelve el precio final + la promo aplicada + monto descontado.
 */
export function calcularPrecioConPromo(args: {
  precioBase: number
  promociones: Promocion[]
  fechaInicio: Date | string
  servicioId: string
  profesionalId: string | null
  metodoPago?: string | null
}): {
  precioFinal: number
  precioOriginal: number
  descuento: number
  promocionAplicada: Promocion | null
} {
  const { precioBase, promociones, fechaInicio, servicioId, profesionalId, metodoPago } = args

  const aplicables = promociones.filter(p =>
    promoAplica(p, { fechaInicio, servicioId, profesionalId, metodoPago })
  )

  if (aplicables.length === 0) {
    return {
      precioFinal: precioBase,
      precioOriginal: precioBase,
      descuento: 0,
      promocionAplicada: null,
    }
  }

  // Calcular precio con cada promo y elegir la mejor (mayor descuento)
  let mejor: { promo: Promocion; precio: number; descuento: number } | null = null
  for (const promo of aplicables) {
    const precio = calcularPrecioFinalConPromo(precioBase, promo, servicioId)
    const descuento = precioBase - precio
    if (!mejor || descuento > mejor.descuento) {
      mejor = { promo, precio, descuento }
    }
  }

  return {
    precioFinal: mejor!.precio,
    precioOriginal: precioBase,
    descuento: mejor!.descuento,
    promocionAplicada: mejor!.promo,
  }
}

function calcularPrecioFinalConPromo(precioBase: number, promo: Promocion, servicioId: string): number {
  // 1. precios_override tiene prioridad (precio final fijo por servicio)
  if (promo.precios_override && servicioId in promo.precios_override) {
    return Math.max(0, promo.precios_override[servicioId])
  }
  // 2. Descuento porcentual
  if (promo.descuento_pct != null) {
    return Math.max(0, precioBase - Math.round(precioBase * (promo.descuento_pct / 100)))
  }
  // 3. Descuento fijo
  if (promo.descuento_monto != null) {
    return Math.max(0, precioBase - promo.descuento_monto)
  }
  return precioBase
}

/**
 * Devuelve las promos vigentes HOY que TODAVÍA pueden aplicarse hoy (para mostrar banner).
 * Filtra por: activa, vigencia por fecha, día de semana, y hora_hasta (si ya pasó, no mostrar).
 * No filtra por hora_desde: puede mostrarse antes para anunciar "Happy Hour de 14 a 17".
 */
export function promosDelDia(promociones: Promocion[], fecha: Date = new Date()): Promocion[] {
  const dateStr = fechaArYMD(fecha)
  const dia = diaSemanaAR(fecha)
  const fechaAR = toAR(fecha)
  const horaAhoraMin = fechaAR.getHours() * 60 + fechaAR.getMinutes()

  return promociones.filter(p => {
    if (!p.activa) return false
    if (p.fecha_desde && dateStr < p.fecha_desde) return false
    if (p.fecha_hasta && dateStr > p.fecha_hasta) return false
    if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(dia)) return false
    // Si la promo tiene hora_hasta y ya pasó, no seguir mostrándola
    if (p.hora_hasta) {
      const [h, m] = p.hora_hasta.split(':').map(Number)
      if (horaAhoraMin >= h * 60 + m) return false
    }
    return true
  })
}

/**
 * Descripción legible del descuento (para banner/badge).
 * Ej: "20% off", "$5.000 off"
 */
export function descripcionDescuento(promo: Promocion): string {
  if (promo.descuento_pct != null) return `${promo.descuento_pct}% off`
  if (promo.descuento_monto != null) return `$${Number(promo.descuento_monto).toLocaleString('es-AR')} off`
  if (promo.precios_override) {
    const cant = Object.keys(promo.precios_override).length
    return `${cant} servicio${cant > 1 ? 's' : ''} c/precio promo`
  }
  return 'promo'
}

/**
 * Descripción legible del horario/día de la promo (para el banner).
 * Ej: "miércoles de 14 a 17hs", "todos los días"
 */
export function descripcionHorario(promo: Promocion): string {
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  let partes: string[] = []

  if (promo.dias_semana && promo.dias_semana.length > 0 && promo.dias_semana.length < 7) {
    partes.push(promo.dias_semana.map(d => DIAS[d]).join(', '))
  }

  if (promo.hora_desde && promo.hora_hasta) {
    partes.push(`de ${promo.hora_desde.slice(0, 5)} a ${promo.hora_hasta.slice(0, 5)}`)
  } else if (promo.hora_desde) {
    partes.push(`desde ${promo.hora_desde.slice(0, 5)}`)
  } else if (promo.hora_hasta) {
    partes.push(`hasta ${promo.hora_hasta.slice(0, 5)}`)
  }

  return partes.join(' ') || 'todos los días'
}
