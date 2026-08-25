// Topes ANUALES de ingresos brutos por categoría — Monotributo Servicios.
// Estos valores cambian con cada actualización de AFIP (típicamente 1 vez al año en enero).
// Verificar y actualizar acá cuando salga la nueva tabla:
// https://www.afip.gob.ar/monotributo/categorias.asp
//
// Valores de referencia 2026 (sujetos a actualización oficial).

export interface CategoriaMonotributo {
  letra: string
  topeAnual: number
  cuotaMensual?: number  // opcional, informativo
  esBienes?: boolean     // categorías I/J/K solo para venta de bienes
}

export const CATEGORIAS_SERVICIOS: CategoriaMonotributo[] = [
  { letra: 'A', topeAnual: 7813063 },
  { letra: 'B', topeAnual: 11447046 },
  { letra: 'C', topeAnual: 16050091 },
  { letra: 'D', topeAnual: 19926341 },
  { letra: 'E', topeAnual: 23439190 },
  { letra: 'F', topeAnual: 29374695 },
  { letra: 'G', topeAnual: 35128502 },
  { letra: 'H', topeAnual: 53298417 },
]

export const CATEGORIAS_BIENES: CategoriaMonotributo[] = [
  ...CATEGORIAS_SERVICIOS,
  { letra: 'I', topeAnual: 59657887, esBienes: true },
  { letra: 'J', topeAnual: 68318880, esBienes: true },
  { letra: 'K', topeAnual: 82370281, esBienes: true },
]

export function getCategoria(letra: string, esBienes = false): CategoriaMonotributo | null {
  const list = esBienes ? CATEGORIAS_BIENES : CATEGORIAS_SERVICIOS
  return list.find((c) => c.letra === letra) || null
}

export function getProximaCategoria(letra: string, esBienes = false): CategoriaMonotributo | null {
  const list = esBienes ? CATEGORIAS_BIENES : CATEGORIAS_SERVICIOS
  const idx = list.findIndex((c) => c.letra === letra)
  if (idx === -1 || idx === list.length - 1) return null
  return list[idx + 1]
}

/**
 * Calcula el % alcanzado del tope de la categoría dada,
 * proyectado a 12 meses según los meses transcurridos.
 *
 * AFIP recategoriza cada 6 meses tomando los últimos 12 meses,
 * pero para alertar tempranamente usamos un ratio proyectado.
 */
export function calcularRiesgo(facturadoUltimos12Meses: number, tope: number): {
  porcentaje: number
  nivel: 'verde' | 'amarillo' | 'rojo'
} {
  const porcentaje = tope > 0 ? (facturadoUltimos12Meses / tope) * 100 : 0
  let nivel: 'verde' | 'amarillo' | 'rojo' = 'verde'
  if (porcentaje >= 90) nivel = 'rojo'
  else if (porcentaje >= 70) nivel = 'amarillo'
  return { porcentaje, nivel }
}

/**
 * Devuelve la fecha de la próxima recategorización de Monotributo
 * (AFIP recategoriza el 1 de enero y el 1 de julio).
 */
export function proximaRecategorizacion(now = new Date()): Date {
  const anio = now.getFullYear()
  const mes = now.getMonth() // 0-11
  if (mes < 6) return new Date(anio, 6, 1)   // 1 de julio
  return new Date(anio + 1, 0, 1)            // 1 de enero próximo
}

/**
 * Cuánto te falta para llegar al tope (anual) y cuánto podés facturar por mes
 * en promedio hasta la próxima recategorización para no pasarte.
 */
export function calcularFaltante(
  facturadoUltimos12Meses: number,
  tope: number,
  now = new Date()
): {
  faltanteAnual: number
  mesesHastaRecategorizacion: number
  promedioMensualPermitido: number
  promedioMensualActual: number
} {
  const faltanteAnual = Math.max(0, tope - facturadoUltimos12Meses)
  const proxima = proximaRecategorizacion(now)
  const diffMs = proxima.getTime() - now.getTime()
  const mesesHastaRecategorizacion = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)))
  const promedioMensualPermitido = faltanteAnual / mesesHastaRecategorizacion
  const promedioMensualActual = facturadoUltimos12Meses / 12
  return {
    faltanteAnual,
    mesesHastaRecategorizacion,
    promedioMensualPermitido,
    promedioMensualActual,
  }
}
