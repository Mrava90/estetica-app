// Categorias del Monotributo: topes ANUALES de ingresos brutos y cuota mensual.
//
// Fuente: https://www.arca.gob.ar/monotributo/categorias.asp
// Tabla "Valores de aplicacion desde el 1/08/2026" (leida el 02/10/2026).
//
// ARCA actualiza estos montos DOS veces por año, en febrero y en agosto,
// por IPC. Cuando salga la tabla nueva, reemplazar los numeros de abajo y
// VIGENCIA_TABLA. La pantalla /afip muestra la vigencia para que se note si
// quedo vieja.
//
// Desde la Ley 27.743 (2024) las escalas de servicios y de venta de bienes
// estan unificadas: un prestador de servicios puede llegar hasta la K. Antes
// los servicios terminaban en la H; por eso la lista ya no se separa.

/** Fecha desde la que rigen los valores de abajo (AAAA-MM-DD). */
export const VIGENCIA_TABLA = '2026-08-01'

export interface CategoriaMonotributo {
  letra: string
  topeAnual: number
  /** Impuesto integrado + SIPA + obra social, locaciones y prestaciones de servicios. */
  cuotaServicios: number
  /** Idem, venta de cosas muebles. */
  cuotaBienes: number
}

export const CATEGORIAS: CategoriaMonotributo[] = [
  { letra: 'A', topeAnual: 12009410.45,  cuotaServicios: 49527.18,   cuotaBienes: 49527.18 },
  { letra: 'B', topeAnual: 17595182.74,  cuotaServicios: 56379.08,   cuotaBienes: 56379.08 },
  { letra: 'C', topeAnual: 24670494.31,  cuotaServicios: 66020.12,   cuotaBienes: 64530.58 },
  { letra: 'D', topeAnual: 30628651.43,  cuotaServicios: 84612.93,   cuotaBienes: 82564.81 },
  { letra: 'E', topeAnual: 36028231.33,  cuotaServicios: 119811.45,  cuotaBienes: 108267.51 },
  { letra: 'F', topeAnual: 45151659.41,  cuotaServicios: 150784.21,  cuotaBienes: 129930.65 },
  { letra: 'G', topeAnual: 53995798.87,  cuotaServicios: 230312.94,  cuotaBienes: 158815.05 },
  { letra: 'H', topeAnual: 81924660.37,  cuotaServicios: 522706.68,  cuotaBienes: 317895.01 },
  { letra: 'I', topeAnual: 91699761.90,  cuotaServicios: 963747.86,  cuotaBienes: 474992.78 },
  { letra: 'J', topeAnual: 105012519.20, cuotaServicios: 1167299.76, cuotaBienes: 580793.69 },
  { letra: 'K', topeAnual: 126610838.75, cuotaServicios: 1614446.04, cuotaBienes: 702103.24 },
]

export function getCategoria(letra: string): CategoriaMonotributo | null {
  return CATEGORIAS.find((c) => c.letra === letra) || null
}

export function getProximaCategoria(letra: string): CategoriaMonotributo | null {
  const idx = CATEGORIAS.findIndex((c) => c.letra === letra)
  if (idx === -1 || idx === CATEGORIAS.length - 1) return null
  return CATEGORIAS[idx + 1]
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
