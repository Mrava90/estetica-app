import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ───────────────────────────────────────────────────
interface CitaInsert {
  profesional_id: string | null
  servicio_id: string
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
  errors: string[]
}

// ── CSV Parser ──────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current)
        current = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current)
        current = ''
        if (row.some(cell => cell.trim() !== '')) rows.push(row)
        row = []
        if (ch === '\r') i++ // skip \n after \r
      } else {
        current += ch
      }
    }
  }
  // Last row
  if (current || row.length > 0) {
    row.push(current)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
  }

  return rows
}

// ── Helpers ─────────────────────────────────────────────────
function parseSheetDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null
  const trimmed = dateStr.trim()

  // Try DD/MM/YYYY or D/M/YYYY
  const parts = trimmed.split('/')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
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
  // Handle Argentine locale: "1.234,50" → 1234.50
  // Also handle plain numbers: "1234.50"
  let cleaned = raw.trim()
    .replace(/[$\s]/g, '') // remove $ and spaces
    .replace(/"/g, '')      // remove quotes

  // If has both . and , → Argentine format (1.234,50)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Only comma → could be decimal (1234,50)
    cleaned = cleaned.replace(',', '.')
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
  servicioId: string
): CitaInsert[] {
  const citas: CitaInsert[] = []
  let currentDate: string | null = null
  const dailyCount: Record<string, number> = {}

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue

    // Column mapping (same for SSR and KW)
    const dateVal = row[0]
    const clientName = row[1]?.trim()
    const serviceName = row[2]?.trim()
    const entryAmount = parseAmount(row[4]) // ENTRADA column
    const paymentMethod = row[5]?.trim()
    const professional = row[6]?.trim()

    // Update current date if present
    const parsedDate = parseSheetDate(dateVal)
    if (parsedDate) currentDate = parsedDate

    // Skip rows without essential data
    if (!currentDate || !clientName || entryAmount <= 0) continue

    // Sequential time within day
    if (!dailyCount[currentDate]) dailyCount[currentDate] = 0
    dailyCount[currentDate]++
    const minuteOffset = (dailyCount[currentDate] - 1) * 5
    const hour = 9 + Math.floor(minuteOffset / 60)
    const minute = minuteOffset % 60

    citas.push({
      profesional_id: mapProfesional(professional, profMap),
      servicio_id: servicioId,
      fecha_inicio: formatISO(currentDate, hour, minute),
      fecha_fin: formatISO(currentDate, hour + 1, minute),
      status: 'completada',
      notas: `[${sheetName}] ${clientName} - ${serviceName || ''}`.trim(),
      precio_cobrado: entryAmount,
      metodo_pago: mapMetodoPago(paymentMethod),
      origen: 'sheets',
      cliente_id: null,
    })
  }

  return citas
}

function parseGastosSheet(rows: string[][]): MovimientoInsert[] {
  const movs: MovimientoInsert[] = []

  // Three sections side by side, data starts at row 3 (0-indexed)
  const sections = [
    { cols: [0, 1, 2, 3], prefix: 'Gasto local' },       // GASTOS LOCAL
    { cols: [6, 7, 8, 9], prefix: 'Adelanto comisión' },  // ADELANTOS/PAGOS COMISION
    { cols: [11, 12, 13, 14], prefix: 'Gasto personal' }, // GASTOS CASA
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

      if (lastDate && desc && amount > 0) {
        movs.push({
          fecha: lastDate,
          monto: -amount, // negative = expense
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

  const ssrUrl = process.env.SHEETS_CSV_URL_SSR
  const kwUrl = process.env.SHEETS_CSV_URL_KW
  const gastosUrl = process.env.SHEETS_CSV_URL_GASTOS

  if (!ssrUrl || !kwUrl || !gastosUrl) {
    throw new Error('Missing SHEETS_CSV_URL_* environment variables')
  }

  // 1. Fetch all CSVs in parallel
  const [ssrText, kwText, gastosText] = await Promise.all([
    fetch(ssrUrl).then(r => r.text()),
    fetch(kwUrl).then(r => r.text()),
    fetch(gastosUrl).then(r => r.text()),
  ])

  const ssrRows = parseCSV(ssrText)
  const kwRows = parseCSV(kwText)
  const gastosRows = parseCSV(gastosText)

  // 2. Get professionals map
  const { data: profs } = await supabase.from('profesionales').select('id, nombre')
  const profMap: Record<string, string> = {}
  for (const p of profs || []) {
    profMap[p.nombre.toLowerCase()] = p.id
  }

  // 3. Get or create sync services
  const servicioIds: Record<string, string> = {}
  for (const name of ['Sync SSR', 'Sync KW']) {
    const { data: existing } = await supabase.from('servicios').select('id').eq('nombre', name).single()
    if (existing) {
      servicioIds[name] = existing.id
    } else {
      const { data: created } = await supabase.from('servicios').insert({
        nombre: name,
        descripcion: `Servicio sincronizado desde hoja ${name.replace('Sync ', '')}`,
        duracion_minutos: 60,
        precio_efectivo: 0,
        precio_mercadopago: 0,
        activo: false,
      }).select('id').single()
      if (created) servicioIds[name] = created.id
    }
  }

  // 4. Parse sheets
  const citasSSR = parseAppointmentSheet(ssrRows, 'SSR', profMap, servicioIds['Sync SSR'])
  const citasKW = parseAppointmentSheet(kwRows, 'KW', profMap, servicioIds['Sync KW'])
  const allCitas = [...citasSSR, ...citasKW]
  const allMovimientos = parseGastosSheet(gastosRows)

  // 5. Delete old sheet-synced data
  const { error: delCitasErr } = await supabase.from('citas').delete().eq('origen', 'sheets')
  if (delCitasErr) errors.push(`Error deleting citas: ${delCitasErr.message}`)

  const { error: delMovsErr } = await supabase.from('movimientos_caja').delete().eq('origen', 'sheets')
  if (delMovsErr) errors.push(`Error deleting movimientos: ${delMovsErr.message}`)

  // 6. Insert new data in batches
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
    errors,
  }
}
