/**
 * Lectura de las hojas "Afip SSR" y "Afip KW" del Google Sheet, cruzadas
 * con la tabla `facturas` de Supabase y con los pagos de MercadoPago.
 *
 * Vive en lib/ (y no dentro del route handler) porque la usan dos lugares:
 *   - GET /api/facturacion/sheet  → la pantalla /facturacion
 *   - GET /api/cron/facturar-qr   → la facturacion automatica
 *
 * El cron no puede hacer fetch al endpoint HTTP porque el middleware lo
 * redirige a /login, y abrirlo al publico seria peor que compartir la funcion.
 *
 * Formato de cada hoja (columnas A-K):
 *   A: Fecha DD/MM (se propaga hacia abajo cuando esta vacia)
 *   B: Cliente        C: Servicio       D: Costo p/ comision
 *   E: Entrada (monto a facturar)       F: Medio de pago
 *   G: Profesional    H: % Comision     I: Comision $
 *   J: Neto local     K: DNI
 */

import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'
import { traerPagosDelMes, crearMatcher, type TipoPagoMP } from '@/lib/mercadopago'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

/** Como se cobro la venta segun el sheet. */
export type MedioPago = 'MercadoPago' | 'Efectivo' | 'Otro'

export interface ItemFacturacion {
  afip_row_key: string
  fecha: string
  cliente_nombre: string
  cliente_dni: string | null
  servicio_nombre: string
  monto: number
  medio_pago: MedioPago
  factura_id: string | null
  factura_estado: string | null
  factura_cae: string | null
  factura_numero: string | null
  factura_vencimiento: string | null
  factura_error: string | null
  tipo_pago: TipoPagoMP | null
  mp_payment_id: number | null
  mp_comision: number | null
  mp_neto: number | null
  mp_match: 'unico' | 'ambiguo' | 'sin_match' | null
}

// ── Helpers de parseo ─────────────────────────────────────────────────────

function parseAmount(str: string): number {
  if (!str || !str.trim()) return 0
  let c = str.trim().replace(/[$\s"]/g, '')
  if (c.includes('.') && c.includes(',')) c = c.replace(/\./g, '').replace(',', '.')
  else if (c.includes(',')) {
    const ac = c.split(',')[1]
    if (ac && ac.length === 3) c = c.replace(',', '')
    else c = c.replace(',', '.')
  }
  const n = parseFloat(c)
  return isNaN(n) ? 0 : n
}

/** Convierte "DD/MM" → "YYYY-MM-DD" usando el año dado. */
function parseDDMM(str: string, year: number): string | null {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const d = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface FilaAfip {
  afip_row_key: string
  fecha: string
  cliente: string
  servicio: string
  monto: number
  dni: string | null
  medio: MedioPago
}

interface OpcionesParseo {
  /** Indice de columna del DNI. Las hojas Afip lo tienen en K(10); KW en J(9). */
  colDni: number
  /** Si se pasa, solo devuelve las filas cuyo medio de pago cumpla el predicado. */
  filtroMedio?: (medio: MedioPago) => boolean
}

function normalizarMedio(raw: string): MedioPago {
  const v = raw.trim().toLowerCase()
  if (v.includes('mercado')) return 'MercadoPago'
  if (v.includes('efectivo')) return 'Efectivo'
  return 'Otro'   // Gift Card y cualquier cosa rara
}

function parsearFilas(
  rows: string[][],
  prefix: string,
  targetYear: number,
  targetMonth: number,
  opts: OpcionesParseo,
): FilaAfip[] {
  const filas: FilaAfip[] = []
  let currentDate: string | null = null

  for (let i = 1; i < rows.length; i++) {  // fila 0 = encabezado
    const row = rows[i]
    if (!row || row.length < 2) continue

    const dateVal = (row[0] || '').trim()
    if (dateVal) {
      const parsed = parseDDMM(dateVal, targetYear)
      if (parsed) currentDate = parsed
    }
    if (!currentDate) continue

    const [, rowMonthStr] = currentDate.split('-')
    if (parseInt(rowMonthStr, 10) !== targetMonth) continue

    const medio = normalizarMedio(row[5] || '')   // columna F: MEDIO DE PAGO
    if (opts.filtroMedio && !opts.filtroMedio(medio)) continue

    const cliente = (row[1] || '').trim()
    const servicio = (row[2] || '').trim()
    const monto = parseAmount(row[4] || '')       // columna E: ENTRADA
    const dni = (row[opts.colDni] || '').trim() || null

    if (!cliente || monto <= 0) continue

    filas.push({ afip_row_key: `${prefix}-${i}`, fecha: currentDate, cliente, servicio, monto, dni, medio })
  }

  return filas
}

// ── API publica del modulo ────────────────────────────────────────────────

export interface ResultadoFacturacionSheet {
  items: ItemFacturacion[]
  mpDisponible: boolean
}

/**
 * Devuelve las filas facturables de un mes (formato "YYYY-MM"), cruzadas
 * con las facturas ya emitidas y con los pagos de MercadoPago.
 *
 * Si MercadoPago no responde o falta el token, los campos mp_* vienen en
 * null y `mpDisponible` es false — el resto funciona igual.
 */
export async function obtenerFilasFacturacion(mes: string): Promise<ResultadoFacturacionSheet> {
  const [yearStr, monthStr] = mes.split('-')
  const targetYear = parseInt(yearStr, 10)
  const targetMonth = parseInt(monthStr, 10)

  // 1. Autenticar con Google
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const client = await auth.getClient()
  const tokenRes = await client.getAccessToken()
  const token = tokenRes.token

  async function fetchSheet(tabName: string): Promise<string[][]> {
    const range = encodeURIComponent(`'${tabName}'!A:K`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const data = await res.json()
    return data.values || []
  }

  // 2. Leer las 4 hojas + pagos MP en paralelo.
  //    Las hojas "Afip *" son un subconjunto de "KW"/"SSR" con solo las ventas
  //    de MercadoPago. Se siguen usando como fuente de esas para no cambiar los
  //    afip_row_key de las facturas ya emitidas. De "KW"/"SSR" tomamos solo lo
  //    que NO es MercadoPago (efectivo y gift card), que no esta en las Afip.
  const [rowsAfipSSR, rowsAfipKW, rowsKW, rowsSSR, pagosMP] = await Promise.all([
    fetchSheet('Afip SSR'),
    fetchSheet('Afip KW'),
    fetchSheet('KW'),
    fetchSheet('SSR'),
    traerPagosDelMes(mes),
  ])

  // 3. Parsear y ordenar por fecha
  const soloNoMP = (m: MedioPago) => m !== 'MercadoPago'
  const filas = [
    // MercadoPago — desde las hojas Afip (keys historicas, no tocar)
    ...parsearFilas(rowsAfipSSR, 'afip-ssr', targetYear, targetMonth, { colDni: 10 }),
    ...parsearFilas(rowsAfipKW, 'afip-kw', targetYear, targetMonth, { colDni: 10 }),
    // Efectivo y otros — desde las hojas completas. El DNI en "KW" esta en la
    // columna J(9), no en la K(10) como en las Afip.
    ...parsearFilas(rowsKW, 'kw', targetYear, targetMonth, { colDni: 9, filtroMedio: soloNoMP }),
    ...parsearFilas(rowsSSR, 'ssr', targetYear, targetMonth, { colDni: 10, filtroMedio: soloNoMP }),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  // 4. Cruzar con la tabla facturas
  const supabase = getSupabase()
  const keys = filas.map(f => f.afip_row_key)
  const { data: facturas } = await supabase
    .from('facturas')
    .select('afip_row_key, id, estado, cae, numero_cbte, cae_vencimiento, error_msg')
    .in('afip_row_key', keys)

  type FacturaRow = NonNullable<typeof facturas>[number]
  const facturaMap: Record<string, FacturaRow> = {}
  for (const f of facturas || []) {
    if (f.afip_row_key) facturaMap[f.afip_row_key] = f
  }

  // 5. Combinar con MercadoPago.
  // El matcher consume cada pago una sola vez, recorriendo las filas ya
  // ordenadas por fecha. Si dos filas del mismo dia tienen el mismo monto,
  // la primera se lleva el pago y ambas quedan marcadas 'ambiguo'.
  const matchMP = crearMatcher(pagosMP)

  const items: ItemFacturacion[] = filas.map(fila => {
    const factura = facturaMap[fila.afip_row_key] ?? null
    // Solo tiene sentido cruzar contra MercadoPago las ventas cobradas por ahi.
    // Una venta en efectivo no tiene pago de MP asociado.
    const { pago, match } = fila.medio === 'MercadoPago'
      ? matchMP(fila.fecha, fila.monto)
      : { pago: null, match: 'sin_match' as const }
    return {
      afip_row_key:        fila.afip_row_key,
      fecha:               fila.fecha,
      cliente_nombre:      fila.cliente,
      cliente_dni:         fila.dni,
      servicio_nombre:     fila.servicio,
      monto:               fila.monto,
      medio_pago:          fila.medio,
      factura_id:          factura?.id ?? null,
      factura_estado:      factura?.estado ?? null,
      factura_cae:         factura?.cae ?? null,
      factura_numero:      factura?.numero_cbte != null ? String(factura.numero_cbte).padStart(8, '0') : null,
      factura_vencimiento: factura?.cae_vencimiento ?? null,
      factura_error:       factura?.error_msg ?? null,
      tipo_pago:           pago?.tipo ?? null,
      mp_payment_id:       pago?.id ?? null,
      mp_comision:         pago?.comision ?? null,
      mp_neto:             pago?.neto ?? null,
      mp_match:            fila.medio === 'MercadoPago' && pagosMP.length > 0 ? match : null,
    }
  })

  return { items, mpDisponible: pagosMP.length > 0 }
}
