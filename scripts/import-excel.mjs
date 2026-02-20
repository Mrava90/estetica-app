/**
 * Script de importación: Excel "Nueva Agenda 2026" → Supabase
 *
 * Importa:
 * 1. Clientes (desde hojas SSR + KW, deduplicados por nombre)
 * 2. Citas completadas (desde SSR + KW → tabla citas)
 * 3. Gastos y movimientos (desde hoja Gastos → tabla movimientos_caja)
 *
 * Uso: node scripts/import-excel.mjs
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import path from 'path'

// ── Config (lee de .env.local) ──────────────────────────────
import { readFileSync } from 'fs'
const envFile = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '.env.local'), 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(l => l.includes('=')).map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] }))

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const EXCEL_PATH = path.join('C:', 'Users', 'marti', 'Downloads', 'Nueva Agenda 2026.xlsx')

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ─────────────────────────────────────────────────
function excelSerialToDate(serial) {
  if (!serial || typeof serial !== 'number' || serial < 40000) return null
  const utcDays = serial - 25569
  return new Date(utcDays * 86400000)
}

function formatDate(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatISO(date, hour = 10, minute = 0) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:00-03:00`
}

function cleanName(name) {
  if (!name || typeof name !== 'string') return null
  return name.trim().replace(/\s+/g, ' ')
}

function mapMetodoPago(raw) {
  if (!raw) return 'efectivo'
  const lower = raw.toString().toLowerCase().trim()
  if (lower.includes('mercado') || lower === 'mp') return 'mercadopago'
  if (lower.includes('transfer')) return 'transferencia'
  if (lower.includes('gift')) return 'efectivo' // gift cards count as efectivo
  return 'efectivo'
}

function mapProfesional(name, profMap) {
  if (!name) return null
  const lower = name.toString().toLowerCase().trim()
  if (lower === 'lola') return profMap['lola']
  if (lower === 'cami' || lower === 'camila') return profMap['camila']
  if (lower === 'denise') return profMap['denise']
  if (lower === 'fabi' || lower === 'fabian') return profMap['fabi'] || null
  return null
}

// Batch insert with chunking (Supabase has limits)
async function batchInsert(table, rows, chunkSize = 500) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await sb.from(table).insert(chunk)
    if (error) {
      console.error(`  Error insertando en ${table} (chunk ${i}-${i + chunk.length}):`, error.message)
      // Try one by one for the failed chunk
      for (const row of chunk) {
        const { error: e2 } = await sb.from(table).insert(row)
        if (!e2) inserted++
      }
    } else {
      inserted += chunk.length
    }
  }
  return inserted
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('=== Importación Excel → Supabase ===\n')

  // 1. Read Excel
  console.log('1. Leyendo Excel...')
  const wb = XLSX.readFile(EXCEL_PATH)
  console.log(`   Hojas: ${wb.SheetNames.join(', ')}\n`)

  // 2. Get existing professionals
  console.log('2. Obteniendo profesionales...')
  const { data: profs } = await sb.from('profesionales').select('id, nombre')
  const profMap = {}
  for (const p of profs) {
    profMap[p.nombre.toLowerCase()] = p.id
  }
  console.log(`   Profesionales: ${profs.map(p => p.nombre).join(', ')}`)

  // 3. Create import services (SSR + KW)
  console.log('\n3. Creando servicios para importación...')
  const servicesToCreate = [
    { nombre: 'Importado SSR', descripcion: 'Servicio importado desde planilla SSR', duracion_minutos: 60, precio_efectivo: 0, precio_mercadopago: 0, activo: false },
    { nombre: 'Importado KW', descripcion: 'Servicio importado desde planilla KW', duracion_minutos: 60, precio_efectivo: 0, precio_mercadopago: 0, activo: false },
  ]

  const serviceIds = {}
  for (const svc of servicesToCreate) {
    // Check if already exists
    const { data: existing } = await sb.from('servicios').select('id').eq('nombre', svc.nombre).single()
    if (existing) {
      serviceIds[svc.nombre] = existing.id
      console.log(`   ${svc.nombre}: ya existe (${existing.id})`)
    } else {
      const { data: created, error } = await sb.from('servicios').insert(svc).select('id').single()
      if (error) {
        console.error(`   Error creando ${svc.nombre}:`, error.message)
        process.exit(1)
      }
      serviceIds[svc.nombre] = created.id
      console.log(`   ${svc.nombre}: creado (${created.id})`)
    }
  }

  // 4. Process SSR + KW sheets → extract clients and citas
  console.log('\n4. Procesando hojas SSR y KW...')
  const clientMap = new Map() // lowercase name → { nombre, telefono }
  const citasToInsert = []

  for (const sheetName of ['SSR', 'KW']) {
    const ws = wb.Sheets[sheetName]
    if (!ws) { console.log(`   Hoja ${sheetName} no encontrada, saltando...`); continue }
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const servicioId = serviceIds[sheetName === 'SSR' ? 'Importado SSR' : 'Importado KW']
    let currentDate = null
    let dailyCount = {} // date string → count (for sequential times)
    let rowCount = 0

    for (let i = 1; i < data.length; i++) { // skip header row
      const row = data[i]
      if (!row || row.length < 6) continue

      // Column mapping
      const dateVal = row[0]
      const clientName = cleanName(row[1])
      const serviceName = cleanName(row[2])
      const entryAmount = parseFloat(row[4]) // ENTRADA column
      const paymentMethod = row[5]
      const professional = row[6]

      // Update current date if present
      if (dateVal && typeof dateVal === 'number' && dateVal > 40000) {
        currentDate = excelSerialToDate(dateVal)
      }

      // Skip rows without essential data
      if (!currentDate || !clientName || !entryAmount || entryAmount <= 0) continue

      // Track client (unique placeholder phone per client)
      const clientKey = clientName.toLowerCase()
      if (!clientMap.has(clientKey)) {
        const idx = clientMap.size + 1
        const phone = `000${String(idx).padStart(7, '0')}`
        clientMap.set(clientKey, { nombre: clientName, telefono: phone })
      }

      // Sequential time within day
      const dateStr = formatDate(currentDate)
      if (!dailyCount[dateStr]) dailyCount[dateStr] = 0
      dailyCount[dateStr]++
      const minuteOffset = (dailyCount[dateStr] - 1) * 5
      const hour = 9 + Math.floor(minuteOffset / 60)
      const minute = minuteOffset % 60

      citasToInsert.push({
        _clientKey: clientKey, // temp, will be replaced with client_id
        _sheetName: sheetName,
        profesional_id: mapProfesional(professional, profMap),
        servicio_id: servicioId,
        fecha_inicio: formatISO(currentDate, hour, minute),
        fecha_fin: formatISO(currentDate, hour + 1, minute),
        status: 'completada',
        notas: `[${sheetName}] ${serviceName || ''}`.trim(),
        precio_cobrado: entryAmount,
        metodo_pago: mapMetodoPago(paymentMethod),
        origen: 'importado',
      })
      rowCount++
    }
    console.log(`   ${sheetName}: ${rowCount} citas encontradas`)
  }

  // 5. Create clients
  console.log(`\n5. Creando ${clientMap.size} clientes...`)
  const clientsToInsert = Array.from(clientMap.values())

  // Insert clients in batches and get their IDs
  const clientIdMap = new Map() // lowercase name → id

  // First check for existing clients
  const { data: existingClients } = await sb.from('clientes').select('id, nombre')
  if (existingClients) {
    for (const c of existingClients) {
      clientIdMap.set(c.nombre.toLowerCase(), c.id)
    }
  }

  // Filter out already existing clients
  const newClients = clientsToInsert.filter(c => !clientIdMap.has(c.nombre.toLowerCase()))
  console.log(`   ${clientIdMap.size} ya existentes, ${newClients.length} nuevos`)

  if (newClients.length > 0) {
    const inserted = await batchInsert('clientes', newClients)
    console.log(`   ${inserted} clientes insertados`)

    // Fetch all client IDs
    const { data: allClients } = await sb.from('clientes').select('id, nombre')
    if (allClients) {
      for (const c of allClients) {
        clientIdMap.set(c.nombre.toLowerCase(), c.id)
      }
    }
  }

  // 6. Insert citas
  console.log(`\n6. Insertando ${citasToInsert.length} citas...`)
  const citasReady = citasToInsert.map(cita => {
    const { _clientKey, _sheetName, ...rest } = cita
    return {
      ...rest,
      cliente_id: clientIdMap.get(_clientKey) || null,
    }
  })

  const citasInserted = await batchInsert('citas', citasReady)
  console.log(`   ${citasInserted} citas insertadas`)

  // 7. Process Gastos sheet → movimientos_caja
  console.log('\n7. Procesando hoja Gastos...')
  const gastosSheet = wb.Sheets['Gastos']
  const gastosData = XLSX.utils.sheet_to_json(gastosSheet, { header: 1 })
  const movsToInsert = []

  // Section 1: GASTOS LOCAL (cols 0-3)
  let lastDateLocal = null
  for (let i = 3; i < gastosData.length; i++) { // data starts at row 3
    const row = gastosData[i]
    if (!row) continue

    const dateVal = row[0]
    const desc = cleanName(row[1])
    const monto = parseFloat(row[2])
    const medio = row[3]

    if (dateVal && typeof dateVal === 'number' && dateVal > 40000) {
      lastDateLocal = excelSerialToDate(dateVal)
    }

    if (lastDateLocal && desc && monto && monto > 0) {
      movsToInsert.push({
        fecha: formatDate(lastDateLocal),
        monto: -monto, // negative = expense
        tipo: mapMetodoPago(medio) === 'mercadopago' ? 'mercadopago' : 'efectivo',
        descripcion: `Gasto local: ${desc}`,
      })
    }
  }

  // Section 2: ADELANTOS/PAGOS COMISION (cols 6-8)
  let lastDateAdel = null
  for (let i = 3; i < gastosData.length; i++) {
    const row = gastosData[i]
    if (!row) continue

    const dateVal = row[6]
    const desc = cleanName(row[7])
    const monto = parseFloat(row[8])
    const medio = row[9] // Some have payment method

    if (dateVal && typeof dateVal === 'number' && dateVal > 40000) {
      lastDateAdel = excelSerialToDate(dateVal)
    }

    if (lastDateAdel && desc && monto && monto > 0) {
      movsToInsert.push({
        fecha: formatDate(lastDateAdel),
        monto: -monto,
        tipo: mapMetodoPago(medio) === 'mercadopago' ? 'mercadopago' : 'efectivo',
        descripcion: `Adelanto comisión: ${desc}`,
      })
    }
  }

  // Section 3: GASTOS CASA (cols 11-14)
  let lastDateCasa = null
  for (let i = 3; i < gastosData.length; i++) {
    const row = gastosData[i]
    if (!row) continue

    const dateVal = row[11]
    const desc = cleanName(row[12])
    const monto = parseFloat(row[13])
    const medio = row[14]

    if (dateVal && typeof dateVal === 'number' && dateVal > 40000) {
      lastDateCasa = excelSerialToDate(dateVal)
    }

    if (lastDateCasa && desc && monto && monto > 0) {
      movsToInsert.push({
        fecha: formatDate(lastDateCasa),
        monto: -monto,
        tipo: mapMetodoPago(medio) === 'mercadopago' ? 'mercadopago' : 'efectivo',
        descripcion: `Gasto personal: ${desc}`,
      })
    }
  }

  console.log(`   ${movsToInsert.length} movimientos encontrados`)

  // 8. Insert movimientos
  console.log(`\n8. Insertando movimientos de caja...`)
  const movsInserted = await batchInsert('movimientos_caja', movsToInsert)
  console.log(`   ${movsInserted} movimientos insertados`)

  // 9. Summary
  console.log('\n=== RESUMEN ===')
  console.log(`Clientes creados:     ${newClients.length}`)
  console.log(`Citas importadas:     ${citasInserted}`)
  console.log(`Movimientos importados: ${movsInserted}`)

  // Verify one day
  console.log('\n--- Verificación día 2026-01-28 ---')
  const { data: verifCitas } = await sb.from('citas')
    .select('precio_cobrado, metodo_pago')
    .gte('fecha_inicio', '2026-01-28T00:00:00')
    .lt('fecha_inicio', '2026-01-29T00:00:00')
    .eq('status', 'completada')

  if (verifCitas) {
    let ef = 0, mp = 0
    for (const c of verifCitas) {
      if (c.metodo_pago === 'efectivo') ef += c.precio_cobrado || 0
      else mp += c.precio_cobrado || 0
    }
    console.log(`  Cobros: ${verifCitas.length} citas`)
    console.log(`  Efectivo: $${ef.toLocaleString()}`)
    console.log(`  Mercadopago: $${mp.toLocaleString()}`)
    console.log(`  Total ventas: $${(ef + mp).toLocaleString()}`)
  }

  const { data: verifMovs } = await sb.from('movimientos_caja')
    .select('monto, tipo')
    .eq('fecha', '2026-01-28')

  if (verifMovs) {
    let ef = 0, mp = 0
    for (const m of verifMovs) {
      if (m.tipo === 'efectivo') ef += m.monto
      else mp += m.monto
    }
    console.log(`  Movimientos: ${verifMovs.length}`)
    console.log(`  Gastos efectivo: $${ef.toLocaleString()}`)
    console.log(`  Gastos MP: $${mp.toLocaleString()}`)
  }

  console.log('\n✓ Importación completada')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
