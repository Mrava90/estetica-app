/**
 * Cruce entre las ventas del sheet y la tabla `facturas`, por CONTENIDO.
 *
 * ── Por que no por numero de fila ────────────────────────────────────────
 * Hasta el 29/09/2026 cada venta se identificaba con `afip-kw-347`: la hoja
 * y el numero de fila. Las hojas "Afip KW"/"Afip SSR" se arman con formulas a
 * partir de KW/SSR, asi que corregir una venta de arriba (por ejemplo pasarla
 * de efectivo a MercadoPago) corre todas las de abajo. En septiembre eso dejo
 * ventas ya facturadas como pendientes, y otras mostrando el estado de la
 * venta de al lado. Con el boton manual, eso es una factura duplicada.
 *
 * ── Como se cruza ahora ──────────────────────────────────────────────────
 * Cada venta tiene una clave armada con sus datos (ver `claveFila`). Para las
 * facturas guardadas con la clave vieja, o cuando se corrigio el nombre en el
 * sheet, se cruza por fecha + monto + parecido del nombre o DNI, en pasadas
 * de la mas estricta a la mas laxa. Una factura se asigna a una sola venta.
 */

/** Lo minimo de una factura que hace falta para cruzarla. */
export interface FacturaCruce {
  id: string
  afip_row_key: string | null
  fecha: string
  monto: number | string
  receptor_nombre: string | null
  receptor_dni: string | null
}

/** Lo minimo de una venta del sheet. */
export interface VentaCruce {
  clave: string
  fecha: string
  cliente: string
  monto: number
  dni: string | null
}

// ── Nombres ───────────────────────────────────────────────────────────────

/** "Cinthia Gómez " → "cinthia gomez" */
export function normalizarNombre(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras que no identifican a nadie: el receptor generico de ARCA. */
const GENERICAS = new Set(['consumidor', 'final'])

/**
 * Palabras del nombre que sirven para comparar. Se descartan las de menos de
 * 4 letras ("de", "sil", "mia"), que coinciden por azar, y las de
 * "Consumidor Final", que no son de ninguna persona.
 */
function palabras(s: string | null | undefined): Set<string> {
  return new Set(normalizarNombre(s).split(' ').filter(p => p.length >= 4 && !GENERICAS.has(p)))
}

function soloDigitos(s: string | null | undefined): string {
  return String(s || '').replace(/\D/g, '')
}

/**
 * Cuanto se parecen dos personas: 0 = nada. Cuenta palabras compartidas
 * ("gomez" en "cintia gomez" / "Cinthia Gomez") y suma fuerte si el DNI es el
 * mismo. Sirve para desempatar, no para afirmar que son la misma persona.
 */
export function parecido(
  nombreA: string | null | undefined, dniA: string | null | undefined,
  nombreB: string | null | undefined, dniB: string | null | undefined,
): number {
  let score = 0
  const da = soloDigitos(dniA), db = soloDigitos(dniB)
  if (da.length >= 7 && da === db) score += 3
  const pb = palabras(nombreB)
  for (const p of palabras(nombreA)) if (pb.has(p)) score++
  return score
}

// ── Claves ────────────────────────────────────────────────────────────────

/**
 * Clave estable de una venta: hoja + fecha + cliente + monto + ordinal.
 * `afip-kw:2026-09-17:laura jaudenes:72500#1`
 *
 * El ordinal distingue dos ventas identicas del mismo dia (la misma clienta
 * pagando dos veces el mismo importe). No depende de la posicion en la hoja,
 * asi que insertar o borrar filas no la cambia.
 */
export function claveFila(prefijo: string, fecha: string, cliente: string, monto: number, ordinal: number): string {
  return `${prefijo}:${fecha}:${normalizarNombre(cliente)}:${Math.round(monto)}#${ordinal}`
}

const DIA_MS = 86_400_000
function diasEntre(a: string, b: string): number {
  return Math.abs(new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / DIA_MS
}
const mismoMonto = (a: number | string, b: number | string) => Math.abs(Number(a) - Number(b)) < 1

// ── Cruce ─────────────────────────────────────────────────────────────────

/**
 * Asigna a cada venta su factura (o ninguna). Devuelve clave de venta → factura.
 *
 * Pasadas, de la mas segura a la mas laxa. Cada una solo mira lo que las
 * anteriores dejaron sin asignar:
 *   1. Clave exacta (facturas guardadas desde el 29/09/2026).
 *   2. Misma fecha + mismo monto + nombre o DNI parecido.
 *   3. Misma hoja + fecha + monto, cuando hay UNA sola venta y UNA sola
 *      factura libres con esos datos (nombre corregido o "Consumidor Final").
 *   4. Hasta 3 dias de diferencia + mismo monto + nombre o DNI parecido
 *      (fecha corregida en el sheet).
 */
export function asignarFacturas<F extends FacturaCruce>(ventas: VentaCruce[], facturas: F[]): Map<string, F> {
  const asignadas = new Map<string, F>()
  const usadas = new Set<string>()
  const libres = () => ventas.filter(v => !asignadas.has(v.clave))
  const disponibles = () => facturas.filter(f => !usadas.has(f.id))
  const asignar = (v: VentaCruce, f: F) => { asignadas.set(v.clave, f); usadas.add(f.id) }

  // 1. Clave exacta
  const porClave = new Map(facturas.filter(f => f.afip_row_key).map(f => [f.afip_row_key!, f]))
  for (const v of ventas) {
    const f = porClave.get(v.clave)
    if (f && !usadas.has(f.id)) asignar(v, f)
  }

  // 2 y 4: emparejar por puntaje, el mejor primero
  const emparejar = (maxDias: number) => {
    const pares: { v: VentaCruce; f: F; score: number; dias: number }[] = []
    for (const v of libres()) {
      for (const f of disponibles()) {
        if (!mismoMonto(v.monto, f.monto)) continue
        const dias = diasEntre(v.fecha, f.fecha)
        if (dias > maxDias) continue
        const score = parecido(v.cliente, v.dni, f.receptor_nombre, f.receptor_dni)
        if (score > 0) pares.push({ v, f, score, dias })
      }
    }
    pares.sort((a, b) => b.score - a.score || a.dias - b.dias)
    for (const p of pares) {
      if (asignadas.has(p.v.clave) || usadas.has(p.f.id)) continue
      asignar(p.v, p.f)
    }
  }

  emparejar(0)

  // 3. Unico candidato de cada lado con la misma hoja, fecha y monto.
  // Solo facturas con clave vieja de fila: esas seguro salieron de una venta
  // de esa hoja. Una factura manual o de otra hoja podria "tapar" una venta
  // que en realidad sigue sin facturar.
  const grupo = (prefijo: string, fecha: string, monto: number) => `${prefijo}|${fecha}|${Math.round(monto)}`
  const ventasPorGrupo = new Map<string, VentaCruce[]>()
  for (const v of libres()) {
    const k = grupo(v.clave.split(':')[0], v.fecha, v.monto)
    ventasPorGrupo.set(k, [...(ventasPorGrupo.get(k) || []), v])
  }
  const facturasPorGrupo = new Map<string, F[]>()
  for (const f of disponibles()) {
    const vieja = f.afip_row_key?.match(/^(afip-kw|afip-ssr|kw|ssr)-\d+$/)
    if (!vieja) continue
    const k = grupo(vieja[1], f.fecha, Number(f.monto))
    facturasPorGrupo.set(k, [...(facturasPorGrupo.get(k) || []), f])
  }
  for (const [k, vs] of ventasPorGrupo) {
    const fs = facturasPorGrupo.get(k) || []
    if (vs.length === 1 && fs.length === 1) asignar(vs[0], fs[0])
  }

  emparejar(3)

  return asignadas
}

/**
 * Busca una factura emitida que parezca ser la misma venta: mismo monto,
 * hasta 3 dias de diferencia y nombre o DNI parecido. La usa la emision para
 * no duplicar. Devuelve la mas parecida, o null.
 */
export function buscarPosibleDuplicado<F extends FacturaCruce>(
  venta: { fecha: string; monto: number; nombre: string | null; dni: string | null },
  emitidas: F[],
): F | null {
  let mejor: { f: F; score: number; dias: number } | null = null
  for (const f of emitidas) {
    if (!mismoMonto(venta.monto, f.monto)) continue
    const dias = diasEntre(venta.fecha, f.fecha)
    if (dias > 3) continue
    const score = parecido(venta.nombre, venta.dni, f.receptor_nombre, f.receptor_dni)
    if (score === 0) continue
    if (!mejor || score > mejor.score || (score === mejor.score && dias < mejor.dias)) mejor = { f, score, dias }
  }
  return mejor?.f ?? null
}
