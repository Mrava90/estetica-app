/**
 * GET /api/facturacion/sheet?mes=YYYY-MM
 *
 * Lee las hojas "Afip SSR" y "Afip KW" del Google Sheet, las combina
 * y las cruza con la tabla `facturas` de Supabase para devolver el estado
 * de cada fila: pendiente / excluida / emitida / error.
 *
 * Formato de cada hoja (columnas A-K):
 *   A: Fecha DD/MM (se propaga hacia abajo cuando está vacía)
 *   B: Cliente
 *   C: Servicio
 *   D: Costo p/ comisión
 *   E: Entrada (monto a facturar)
 *   F: Medio de pago
 *   G: Profesional
 *   H: % Comisión
 *   I: Comisión $
 *   J: Neto local
 *   K: DNI
 *
 * Keys:
 *   afip-ssr-{rowIdx}  → fila de "Afip SSR"
 *   afip-kw-{rowIdx}   → fila de "Afip KW"
 */

import { NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Convierte "DD/MM" → "YYYY-MM-DD" usando el año del parámetro mes. */
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
}

/** Parsea las filas de una hoja y devuelve las del mes objetivo. */
function parsearFilas(
  rows: string[][],
  prefix: string,
  targetYear: number,
  targetMonth: number,
): FilaAfip[] {
  const filas: FilaAfip[] = []
  let currentDate: string | null = null

  for (let i = 1; i < rows.length; i++) {  // salteamos fila 0 (encabezado)
    const row = rows[i]
    if (!row || row.length < 2) continue

    // Propagación de fecha
    const dateVal = (row[0] || '').trim()
    if (dateVal) {
      const parsed = parseDDMM(dateVal, targetYear)
      if (parsed) currentDate = parsed
    }
    if (!currentDate) continue

    // Filtrar por mes objetivo
    const [, rowMonthStr] = currentDate.split('-')
    if (parseInt(rowMonthStr, 10) !== targetMonth) continue

    const cliente = (row[1] || '').trim()
    const servicio = (row[2] || '').trim()
    const monto = parseAmount(row[4] || '')  // columna E: ENTRADA
    const dni = (row[10] || '').trim() || null  // columna K: DNI

    if (!cliente || monto <= 0) continue

    filas.push({
      afip_row_key: `${prefix}-${i}`,
      fecha: currentDate,
      cliente,
      servicio,
      monto,
      dni,
    })
  }

  return filas
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const mesParam = searchParams.get('mes') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yearStr, monthStr] = mesParam.split('-')
  const targetYear  = parseInt(yearStr, 10)
  const targetMonth = parseInt(monthStr, 10)

  try {
    // ── 1. Autenticar con Google ───────────────────────────────────────────
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

    // ── 2. Leer ambas hojas en paralelo ────────────────────────────────────
    async function fetchSheet(tabName: string): Promise<string[][]> {
      const range = encodeURIComponent(`'${tabName}'!A:K`)
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      return data.values || []
    }

    const [rowsSSR, rowsKW] = await Promise.all([
      fetchSheet('Afip SSR'),
      fetchSheet('Afip KW'),
    ])

    // ── 3. Parsear filas de cada hoja ──────────────────────────────────────
    const filasSSR = parsearFilas(rowsSSR, 'afip-ssr', targetYear, targetMonth)
    const filasKW  = parsearFilas(rowsKW,  'afip-kw',  targetYear, targetMonth)

    // Combinar y ordenar por fecha
    const filas = [...filasSSR, ...filasKW].sort((a, b) => a.fecha.localeCompare(b.fecha))

    // ── 4. Cruzar con tabla facturas ───────────────────────────────────────
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

    // ── 5. Combinar y devolver ─────────────────────────────────────────────
    const result = filas.map(fila => {
      const factura = facturaMap[fila.afip_row_key] ?? null
      return {
        afip_row_key:        fila.afip_row_key,
        fecha:               fila.fecha,
        cliente_nombre:      fila.cliente,
        cliente_dni:         fila.dni,
        servicio_nombre:     fila.servicio,
        monto:               fila.monto,
        factura_id:          factura?.id ?? null,
        factura_estado:      factura?.estado ?? null,
        factura_cae:         factura?.cae ?? null,
        factura_numero:      factura?.numero_cbte != null
                               ? String(factura.numero_cbte).padStart(8, '0')
                               : null,
        factura_vencimiento: factura?.cae_vencimiento ?? null,
        factura_error:       factura?.error_msg ?? null,
      }
    })

    return NextResponse.json({ items: result, total: result.length })

  } catch (err) {
    console.error('facturacion/sheet error:', err)
    return NextResponse.json({ items: [], total: 0, error: String(err) }, { status: 500 })
  }
}
