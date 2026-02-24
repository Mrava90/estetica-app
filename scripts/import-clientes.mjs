import { createClient } from '@supabase/supabase-js'
import pkg from 'xlsx'
const { readFile, utils } = pkg
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Read Excel file
const wb = readFile('C:/Users/marti/Downloads/6891fa1789a736a47c94b3be_24-02-2026.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = utils.sheet_to_json(ws)

console.log(`Total rows: ${rows.length}`)
console.log(`Columns: ${Object.keys(rows[0]).join(', ')}`)
console.log(`Sample:`, rows.slice(0, 3))

const clients = []
for (const row of rows) {
  const fn = (row.fn || '').toString().trim()
  const ln = (row.ln || '').toString().trim()
  const email = (row.email || '').toString().trim() || null
  const phone = (row.phone || '').toString().trim() || null

  const nombre = [fn, ln].filter(Boolean).join(' ')
  if (!nombre) continue

  // Normalize phone: keep only digits
  let telefono = phone
  if (telefono) {
    telefono = telefono.replace(/[^\d]/g, '')
  }

  clients.push({ nombre, telefono, email })
}

console.log(`\nParsed ${clients.length} clients`)
console.log(`Sample:`, clients.slice(0, 5))

// Check for existing clients by phone to avoid duplicates
const { data: existing } = await supabase.from('clientes').select('telefono')
const existingPhones = new Set((existing || []).map(c => c.telefono).filter(Boolean))

// Filter out clients without phone (DB requires telefono NOT NULL)
const withPhone = clients.filter(c => c.telefono)
console.log(`\nWith phone: ${withPhone.length}, Without phone (skipped): ${clients.length - withPhone.length}`)

// Deduplicate within the file itself (keep first occurrence per phone)
const seenPhones = new Set()
const uniqueClients = withPhone.filter(c => {
  if (seenPhones.has(c.telefono)) return false
  seenPhones.add(c.telefono)
  return true
})
console.log(`Unique by phone in file: ${uniqueClients.length}, Dupes in file: ${withPhone.length - uniqueClients.length}`)

const toInsert = uniqueClients.filter(c => !existingPhones.has(c.telefono))

const skipped = clients.length - toInsert.length
console.log(`\nExisting in DB: ${existingPhones.size}`)
console.log(`To insert: ${toInsert.length}`)
console.log(`Skipped (duplicate phone): ${skipped}`)

if (toInsert.length === 0) {
  console.log('\nNothing to insert.')
  process.exit(0)
}

// Insert in batches of 50
let inserted = 0
let errors = 0
for (let i = 0; i < toInsert.length; i += 50) {
  const batch = toInsert.slice(i, i + 50)
  const { error } = await supabase.from('clientes').upsert(batch, { onConflict: 'telefono', ignoreDuplicates: true })
  if (error) {
    console.error(`Error batch ${i}:`, error.message)
    errors++
  } else {
    inserted += batch.length
  }
}

console.log(`\nDone! Inserted: ${inserted}, Errors: ${errors}`)
