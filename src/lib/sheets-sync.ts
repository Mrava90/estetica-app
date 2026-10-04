import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'

// ── Types ───────────────────────────────────────────────────
interface CitaInsert {
  profesional_id: string | null
  servicio_id: null
  fecha_inicio: string
  fecha_fin: string
  status: 'completada'
  notas: string
  precio_cobrado: number
  metodo_pago: string
  origen: 'sheets'
  cliente_id: null
}

interface MovimientoInsert {
  fecha: string
  monto: number
  tipo: 'efectivo' | 'mercadopago'
  descripcion: string
  origen: 'sheets'
}

export interface SyncResult {
  citasCount: number
  movimientosCount: number
  citasSkipped: number
  movimientosSkipped: number
  errors: string[]
  debug: {
    ssrRows: number
    kwRows: number
    ssrCitas: number
    kwCitas: number
    kwFirstRows: string[][]
  }
}

// ── Google Sheets API ───────────────────────────────────────
export async function fetchSheetData(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const client = await auth.getClient()
  const token = await client.getAccessToken()

  const range = encodeURIComponent(`'${sheetName}'!A:O`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`

  // Timeout 30s para que no quede colgado si Google está lento
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.token}` },
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Google Sheets API timeout (${sheetName}): no respondió en 30s`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Sheets API error (${sheetName}): ${res.status} ${text}`)
  }

  const data = await res.json()
  return (data.values || []) as string[][]
}

// ── Helpers ─────────────────────────────────────────────────
function parseSheetDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null
  const trimmed = dateStr.trim()

  const parts = trimmed.split('/')
  if (parts.length === 2 || parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    let year: number

    if (parts.length === 3) {
      year = parseInt(parts[2], 10)
      // Handle 2-digit year (e.g., "26" → 2026)
      if (year < 100) year += 2000
    } else {
      // D/M format without year — assume current year
      year = new Date().getFullYear()
    }

    if (day > 0 && day <= 31 && month > 0 && month <= 12 && year >= 2024) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  return null
}

function parseAmount(raw: string): number {
  if (!raw || !raw.trim()) return 0
  let cleaned = raw.trim()
    .replace(/[$\s]/g, '')
    .replace(/"/g, '')

  // Argentine format: "1.234,50" → 1234.50
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // "30,000" (3 digits after comma) = thousands separator → 30000
    // "30,50" (1-2 digits after comma) = decimal separator → 30.50
    const afterComma = cleaned.split(',')[1]
    if (afterComma && afterComma.length === 3) {
      cleaned = cleaned.replace(',', '')
    } else {
      cleaned = cleaned.replace(',', '.')
    }
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Nombre de la columna PROFESIONAL del sheet → id en la tabla profesionales.
 *
 * Antes era una lista fija (lola, cami, denise, fabi): una profesional nueva
 * entraba sin asignar. Le paso a Brisa desde septiembre de 2026: sus ventas
 * sumaban en la caja pero sin profesional, y sus comisiones no aparecian.
 * Ahora se busca en la tabla, en este orden:
 *   1. nombre exacto, sin mayusculas ni acentos ("BRISA" → Brisa)
 *   2. abreviatura conocida ("cami" → Camila, "fabi" → Fabiana)
 *   3. una sola profesional cuyo nombre empiece igual ("cam" → Camila)
 */
const ALIAS_PROFESIONAL: Record<string, string> = { cami: 'camila', fabi: 'fabiana', fabian: 'fabiana' }

function normalizarNombre(s: string): string {
  return s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function mapProfesional(name: string, profMap: Record<string, string>): string | null {
  if (!name) return null
  const n = normalizarNombre(name)
  if (!n) return null
  if (profMap[n]) return profMap[n]
  const alias = ALIAS_PROFESIONAL[n]
  if (alias && profMap[alias]) return profMap[alias]
  const candidatas = Object.keys(profMap).filter(k => k.startsWith(n) || n.startsWith(k))
  return candidatas.length === 1 ? profMap[candidatas[0]] : null
}

function mapMetodoPago(raw: string): 'efectivo' | 'mercadopago' | 'transferencia' {
  if (!raw) return 'efectivo'
  const lower = raw.toString().toLowerCase().trim()
  if (lower.includes('mercado') || lower === 'mp') return 'mercadopago'
  if (lower.includes('transfer')) return 'transferencia'
  return 'efectivo'
}

function mapMetodoPagoForMov(raw: string): 'efectivo' | 'mercadopago' {
  const mapped = mapMetodoPago(raw)
  return mapped === 'transferencia' ? 'efectivo' : mapped
}

function formatISO(dateStr: string, hour: number, minute: number): string {
  return `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`
}

// ── Sheet Parsers ───────────────────────────────────────────
function parseAppointmentSheet(
  rows: string[][],
  sheetName: 'SSR' | 'KW',
  profMap: Record<string, string>,
  syncFromDate: string,
): { citas: CitaInsert[] } {
  const citas: CitaInsert[] = []
  let currentDate: string | null = null
  const dailyCount: Record<string, number> = {}

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue

    const dateVal = row[0] || ''
    const clientName = row[1]?.trim() || ''
    const serviceName = row[2]?.trim() || ''
    const entryAmount = parseAmount(row[4] || '') // ENTRADA column (E)
    const paymentMethod = row[5]?.trim()
    const professional = row[6]?.trim()
    const comision = parseAmount(row[8] || '') // COMISION column (I)

    const parsedDate = parseSheetDate(dateVal)
    if (parsedDate) currentDate = parsedDate

    if (!currentDate || entryAmount <= 0) continue
    if (currentDate < syncFromDate) continue // saltar registros anteriores al período de sync

    if (!dailyCount[currentDate]) dailyCount[currentDate] = 0
    dailyCount[currentDate]++
    const minuteOffset = (dailyCount[currentDate] - 1) * 5
    const hour = 9 + Math.floor(minuteOffset / 60)
    const minute = minuteOffset % 60

    citas.push({
      profesional_id: mapProfesional(professional, profMap),
      servicio_id: null,
      fecha_inicio: formatISO(currentDate, hour, minute),
      fecha_fin: formatISO(currentDate, hour + 1, minute),
      status: 'completada',
      notas: `[${sheetName}] ${clientName} - ${serviceName || ''}${comision > 0 ? ` | com:${Math.round(comision)}` : ''}`.trim(),
      precio_cobrado: entryAmount,
      metodo_pago: mapMetodoPago(paymentMethod),
      origen: 'sheets',
      cliente_id: null,
    })
  }

  return { citas }
}

function parseGastosSheet(rows: string[][], syncFromDate: string): MovimientoInsert[] {
  const movs: MovimientoInsert[] = []

  const sections = [
    { cols: [0, 1, 2, 3], prefix: 'Gasto local' },
    { cols: [6, 7, 8, 9], prefix: 'Adelanto comisión' },
    { cols: [11, 12, 13, 14], prefix: 'Gasto personal' },
  ]

  for (const section of sections) {
    let lastDate: string | null = null

    for (let i = 3; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue

      const dateVal = row[section.cols[0]] || ''
      const desc = row[section.cols[1]]?.trim() || ''
      const amount = parseAmount(row[section.cols[2]] || '')
      const method = row[section.cols[3]] || ''

      const parsedDate = parseSheetDate(dateVal)
      if (parsedDate) lastDate = parsedDate

      if (lastDate && lastDate < syncFromDate) continue // saltar anteriores al período de sync

      if (lastDate && desc && amount !== 0) {
        movs.push({
          fecha: lastDate,
          monto: -amount, // negate: positive sheet amount = expense (negative), negative = credit (positive)
          tipo: mapMetodoPagoForMov(method),
          descripcion: `${section.prefix}: ${desc}`,
          origen: 'sheets',
        })
      }
    }
  }

  return movs
}

// ── Main Sync ───────────────────────────────────────────────
export async function syncFromSheets(supabase: SupabaseClient): Promise<SyncResult> {
  const errors: string[] = []

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('Missing GOOGLE_SPREADSHEET_ID')
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY')
  }

  // Período de sync: desde el primer día del mes ANTERIOR.
  //
  // Con solo el mes actual se perdia el ultimo dia de cada mes: el sync de las
  // 06:00 del 30/09 todavia no tenia las ventas de ese dia, y el del 01/10 ya
  // traia solo octubre. Asi faltaron en la app las 5 ventas del 30/09/2026 (dos
  // de Brisa, tres de Cami), y tampoco llegaba ninguna correccion hecha en el
  // sheet despues de terminado el mes. Se reemplazan dos meses en vez de uno.
  // En hora argentina: el server corre en UTC.
  const [anioAR, mesAR] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-').map(Number)
  const mesPrevio = mesAR === 1 ? 12 : mesAR - 1
  const anioPrevio = mesAR === 1 ? anioAR - 1 : anioAR
  const syncFromDate = `${anioPrevio}-${String(mesPrevio).padStart(2, '0')}-01`

  // 1. Fetch all sheets via Google Sheets API
  const [ssrRows, kwRows, gastosRows] = await Promise.all([
    fetchSheetData(spreadsheetId, 'SSR'),
    fetchSheetData(spreadsheetId, 'KW'),
    fetchSheetData(spreadsheetId, 'Gastos'),
  ])

  // 2. Get professionals map
  const { data: profs } = await supabase.from('profesionales').select('id, nombre')
  const profMap: Record<string, string> = {}
  for (const p of profs || []) {
    profMap[normalizarNombre(p.nombre)] = p.id
  }

  // 3. Parse sheets (solo registros desde syncFromDate)
  const ssrResult = parseAppointmentSheet(ssrRows, 'SSR', profMap, syncFromDate)
  const kwResult = parseAppointmentSheet(kwRows, 'KW', profMap, syncFromDate)
  const allCitas = [...ssrResult.citas, ...kwResult.citas]
  const allMovimientos = parseGastosSheet(gastosRows, syncFromDate)

  // 4. Borrar solo los datos del período de sync (no toda la historia)
  const { error: delCitasErr } = await supabase.from('citas').delete()
    .eq('origen', 'sheets')
    .gte('fecha_inicio', `${syncFromDate}T00:00:00`)
  if (delCitasErr) errors.push(`Error deleting citas: ${delCitasErr.message}`)

  const { error: delMovsErr } = await supabase.from('movimientos_caja').delete()
    .eq('origen', 'sheets')
    .gte('fecha', syncFromDate)
  if (delMovsErr) errors.push(`Error deleting movimientos: ${delMovsErr.message}`)

  // 5. Insert all sheet data in batches
  let citasInserted = 0
  let movsInserted = 0

  for (let i = 0; i < allCitas.length; i += 500) {
    const chunk = allCitas.slice(i, i + 500)
    const { error } = await supabase.from('citas').insert(chunk)
    if (error) {
      errors.push(`Error inserting citas batch ${i}: ${error.message}`)
    } else {
      citasInserted += chunk.length
    }
  }

  for (let i = 0; i < allMovimientos.length; i += 500) {
    const chunk = allMovimientos.slice(i, i + 500)
    const { error } = await supabase.from('movimientos_caja').insert(chunk)
    if (error) {
      errors.push(`Error inserting movimientos batch ${i}: ${error.message}`)
    } else {
      movsInserted += chunk.length
    }
  }

  return {
    citasCount: citasInserted,
    movimientosCount: movsInserted,
    citasSkipped: 0,
    movimientosSkipped: 0,
    errors,
    debug: {
      ssrRows: ssrRows.length,
      kwRows: kwRows.length,
      ssrCitas: ssrResult.citas.length,
      kwCitas: kwResult.citas.length,
      kwFirstRows: kwRows.slice(0, 5),
    },
  }
}
