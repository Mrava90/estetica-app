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

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
  })

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

function mapProfesional(name: string, profMap: Record<string, string>): string | null {
  if (!name) return null
  const lower = name.toString().toLowerCase().trim()
  if (lower === 'lola') return profMap['lola'] || null
  if (lower === 'cami' || lower === 'camila') return profMap['camila'] || null
  if (lower === 'denise') return profMap['denise'] || null
  if (lower === 'fabi' || lower === 'fabian') return profMap['fabi'] || null
  return null
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
): { citas: CitaInsert[]; comisiones: MovimientoInsert[] } {
  const citas: CitaInsert[] = []
  const comisiones: MovimientoInsert[] = []
  let currentDate: string | null = null
  const dailyCount: Record<string, number> = {}

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue

    const dateVal = row[0] || ''
    const clientName = row[1]?.trim()
    const serviceName = row[2]?.trim()
    const entryAmount = parseAmount(row[4] || '') // ENTRADA column (E)
    const paymentMethod = row[5]?.trim()
    const professional = row[6]?.trim()
    const comisionAmount = parseAmount(row[8] || '') // Comisión $ column (I)

    const parsedDate = parseSheetDate(dateVal)
    if (parsedDate) currentDate = parsedDate

    if (!currentDate || !clientName || entryAmount <= 0) continue

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
      notas: `[${sheetName}] ${clientName} - ${serviceName || ''}`.trim(),
      precio_cobrado: entryAmount,
      metodo_pago: mapMetodoPago(paymentMethod),
      origen: 'sheets',
      cliente_id: null,
    })

    // Commission per appointment (col I = Comisión $)
    if (comisionAmount > 0) {
      comisiones.push({
        fecha: currentDate,
        monto: -comisionAmount, // negative = expense
        tipo: 'efectivo',
        descripcion: `Comisión: ${professional || 'Sin asignar'} - ${clientName}`,
        origen: 'sheets',
      })
    }
  }

  return { citas, comisiones }
}

function parseGastosSheet(rows: string[][]): MovimientoInsert[] {
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
    profMap[p.nombre.toLowerCase()] = p.id
  }

  // 3. Parse sheets
  const ssrResult = parseAppointmentSheet(ssrRows, 'SSR', profMap)
  const kwResult = parseAppointmentSheet(kwRows, 'KW', profMap)
  const allCitas = [...ssrResult.citas, ...kwResult.citas]
  const allMovimientos = [
    ...parseGastosSheet(gastosRows),
    ...ssrResult.comisiones,
    ...kwResult.comisiones,
  ]

  // 4. Deduplication: fetch existing non-sheets data to avoid duplicates
  const [existingCitasRes, existingMovsRes] = await Promise.all([
    supabase
      .from('citas')
      .select('fecha_inicio, profesional_id, precio_cobrado')
      .neq('origen', 'sheets')
      .in('status', ['confirmada', 'completada']),
    supabase
      .from('movimientos_caja')
      .select('fecha, monto, tipo')
      .neq('origen', 'sheets'),
  ])
  const existingCitas = existingCitasRes.data || []
  const existingMovs = existingMovsRes.data || []

  // Filter out sheet records that already exist as manual/online entries
  const dedupedCitas = allCitas.filter((cita) => {
    const citaDate = cita.fecha_inicio.slice(0, 10)
    return !existingCitas.some((e) => {
      const eDate = e.fecha_inicio.slice(0, 10)
      const eMonto = e.precio_cobrado || 0
      const tolerance = cita.precio_cobrado > 0 ? Math.abs(eMonto - cita.precio_cobrado) / cita.precio_cobrado : 0
      return eDate === citaDate && e.profesional_id === cita.profesional_id && tolerance < 0.05
    })
  })

  const dedupedMovs = allMovimientos.filter((mov) => {
    return !existingMovs.some((e) =>
      e.fecha === mov.fecha && e.monto === mov.monto && e.tipo === mov.tipo
    )
  })

  const citasSkipped = allCitas.length - dedupedCitas.length
  const movsSkipped = allMovimientos.length - dedupedMovs.length

  // 5. Delete old sheet-synced data
  const { error: delCitasErr } = await supabase.from('citas').delete().eq('origen', 'sheets')
  if (delCitasErr) errors.push(`Error deleting citas: ${delCitasErr.message}`)

  const { error: delMovsErr } = await supabase.from('movimientos_caja').delete().eq('origen', 'sheets')
  if (delMovsErr) errors.push(`Error deleting movimientos: ${delMovsErr.message}`)

  // 6. Insert deduplicated data in batches
  let citasInserted = 0
  let movsInserted = 0

  for (let i = 0; i < dedupedCitas.length; i += 500) {
    const chunk = dedupedCitas.slice(i, i + 500)
    const { error } = await supabase.from('citas').insert(chunk)
    if (error) {
      errors.push(`Error inserting citas batch ${i}: ${error.message}`)
    } else {
      citasInserted += chunk.length
    }
  }

  for (let i = 0; i < dedupedMovs.length; i += 500) {
    const chunk = dedupedMovs.slice(i, i + 500)
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
    citasSkipped,
    movimientosSkipped: movsSkipped,
    errors,
  }
}
