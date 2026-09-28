/**
 * Exporta los gastos cargados EN LA APP a una pestaña de prueba del Google
 * Sheet, con el mismo formato que la hoja "Gastos" real.
 *
 * ── Por que una pestaña aparte ───────────────────────────────────────────
 * La hoja "Gastos" es el sistema de registro del local y no tiene otra copia.
 * Esto escribe SOLO en "PRUEBA - GASTOS APP", que se crea si no existe y se
 * reescribe entera en cada corrida. La hoja real nunca se toca.
 *
 * ── Que exporta ──────────────────────────────────────────────────────────
 * Solo los movimientos con `origen != 'sheets'`, es decir los cargados a mano
 * desde /caja. Lo que vino del sheet no se devuelve al sheet.
 *
 * ── Formato ──────────────────────────────────────────────────────────────
 * Tres bloques en paralelo, igual que la hoja real:
 *   A-D  GASTOS LOCAL        (fecha, descripcion, monto, medio)
 *   G-J  ADELANTOS/COMISION  (fecha, quien, monto, medio)
 *   L-N  GASTOS CASA         (fecha, descripcion, monto)
 * Cada bloque se llena desde arriba; el mas largo define el alto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { clearAndWriteSheet, ensureSheetExists, getSheetsWriteToken, getSpreadsheetId } from './sheets-backup'

export const HOJA_PRUEBA = 'PRUEBA - GASTOS APP'

/** Prefijos que /caja le pone a la descripcion segun la categoria elegida. */
const PREFIJOS = {
  local:     'Gasto local:',
  adelanto:  'Adelanto comisión:',
  personal:  'Gasto personal:',
} as const

type Categoria = keyof typeof PREFIJOS

interface Fila { fecha: string; desc: string; monto: number; medio: string }

/** "2026-09-26" → "26/09" (como se escribe en la hoja real). */
function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** El tipo de movimiento de la app → el texto de "MEDIO DE PAGO" del sheet. */
function medio(tipo: string): string {
  if (tipo === 'mercadopago') return 'MercadoPago'
  if (tipo === 'efectivo') return 'Efectivo'
  if (tipo === 'transferencia') return 'Transferencia'
  return tipo || ''
}

/** Saca el prefijo de la descripcion y devuelve la categoria + el texto limpio. */
function clasificar(descripcion: string): { cat: Categoria | null; texto: string } {
  for (const [cat, pref] of Object.entries(PREFIJOS) as [Categoria, string][]) {
    if (descripcion.startsWith(pref)) return { cat, texto: descripcion.slice(pref.length).trim() }
  }
  return { cat: null, texto: descripcion }
}

export interface ResultadoExport {
  hoja: string
  filas: number
  porBloque: Record<Categoria, number>
  desde: string | null
  hasta: string | null
}

export async function exportarGastosAppASheet(supabase: SupabaseClient): Promise<ResultadoExport> {
  // 1. Traer lo cargado en la app (nunca lo que vino del sheet)
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('fecha, monto, tipo, descripcion, origen')
    .neq('origen', 'sheets')
    .order('fecha')
  if (error) throw new Error('No se pudieron leer los movimientos: ' + error.message)

  const bloques: Record<Categoria, Fila[]> = { local: [], adelanto: [], personal: [] }
  for (const m of data || []) {
    // Los ingresos manuales no son gastos: no van a esta hoja.
    if (Number(m.monto) >= 0) continue
    const { cat, texto } = clasificar(m.descripcion || '')
    // Sin prefijo reconocible lo mandamos a "local", que es el cajon por defecto.
    const destino: Categoria = cat ?? 'local'
    bloques[destino].push({
      fecha: ddmm(m.fecha),
      desc: texto,
      monto: Math.abs(Number(m.monto)),
      medio: medio(m.tipo),
    })
  }

  // 2. Armar la grilla de 14 columnas (A-N), tres bloques en paralelo
  const alto = Math.max(bloques.local.length, bloques.adelanto.length, bloques.personal.length)
  const filas: (string | number)[][] = []
  filas.push(['', 'GASTOS LOCAL', '', '', '', '', 'ADELANTOS/PAGOS COMISION', '', '', '', '', 'GASTOS CASA', '', ''])
  filas.push(['Fecha', 'Descripcion', 'Monto', 'Medio', '', '', 'Fecha', 'Descripcion', 'Monto', 'Medio', '', 'Fecha', 'Descripcion', 'Monto'])

  for (let i = 0; i < alto; i++) {
    const l = bloques.local[i], a = bloques.adelanto[i], p = bloques.personal[i]
    filas.push([
      l ? l.fecha : '', l ? l.desc : '', l ? l.monto : '', l ? l.medio : '',
      '', '',
      a ? a.fecha : '', a ? a.desc : '', a ? a.monto : '', a ? a.medio : '',
      '',
      p ? p.fecha : '', p ? p.desc : '', p ? p.monto : '',
    ])
  }

  // Pie con los totales, para comparar de un vistazo contra la hoja real
  const total = (c: Categoria) => bloques[c].reduce((s, f) => s + f.monto, 0)
  filas.push([])
  filas.push(['', 'TOTAL', total('local'), '', '', '', '', 'TOTAL', total('adelanto'), '', '', '', 'TOTAL', total('personal')])

  // 3. Escribir, creando la pestaña si hace falta
  const spreadsheetId = getSpreadsheetId()
  const token = await getSheetsWriteToken()
  await ensureSheetExists(spreadsheetId, token, HOJA_PRUEBA)
  await clearAndWriteSheet(spreadsheetId, token, HOJA_PRUEBA, filas)

  const fechas = (data || []).map(m => m.fecha).sort()
  return {
    hoja: HOJA_PRUEBA,
    filas: bloques.local.length + bloques.adelanto.length + bloques.personal.length,
    porBloque: { local: bloques.local.length, adelanto: bloques.adelanto.length, personal: bloques.personal.length },
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
  }
}
