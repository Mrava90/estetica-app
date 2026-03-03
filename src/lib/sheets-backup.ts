import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'

async function getSheetsWriteToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const client = await auth.getClient()
  const tokenRes = await client.getAccessToken()
  if (!tokenRes.token) throw new Error('Could not get Google access token')
  return tokenRes.token
}

async function ensureSheetExists(spreadsheetId: string, token: string, sheetName: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      }),
    }
  )
  // Ignore "already exists" errors (status 400)
  if (!res.ok && res.status !== 400) {
    const text = await res.text()
    throw new Error(`Error creating sheet tab "${sheetName}": ${res.status} ${text}`)
  }
}

async function clearAndWriteSheet(
  spreadsheetId: string,
  token: string,
  sheetName: string,
  values: (string | number)[][]
): Promise<void> {
  const encodedRange = encodeURIComponent(`'${sheetName}'!A:Z`)

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  )

  const writeRange = encodeURIComponent(`'${sheetName}'!A1`)
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  )

  if (!writeRes.ok) {
    const text = await writeRes.text()
    throw new Error(`Sheets write error for "${sheetName}": ${writeRes.status} ${text}`)
  }
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID
  if (!id) throw new Error('Missing GOOGLE_SPREADSHEET_ID')
  return id
}

function checkCredentials() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Missing Google credentials')
  }
}

// ── Backup Calendario ────────────────────────────────────────

export async function backupCalendarioToSheets(
  supabase: SupabaseClient
): Promise<{ citasBackedUp: number }> {
  checkCredentials()
  const spreadsheetId = getSpreadsheetId()

  const { data: citas, error } = await supabase
    .from('citas')
    .select('*, clientes(*), profesionales(*), servicios(*)')
    .order('fecha_inicio', { ascending: false })

  if (error) throw new Error(`Error fetching citas: ${error.message}`)

  const header = [
    'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Email',
    'Servicio', 'Profesional', 'Estado', 'Precio', 'Método Pago',
    'Notas', 'Origen', 'ID',
  ]

  const rows = (citas || []).map((c) => {
    const dt = new Date(c.fecha_inicio)
    const fecha = dt.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    const hora = dt.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    })
    return [
      fecha, hora,
      c.clientes?.nombre ?? '',
      c.clientes?.telefono ?? '',
      c.clientes?.email ?? '',
      c.servicios?.nombre ?? '',
      c.profesionales?.nombre ?? '',
      c.status,
      c.precio_cobrado ?? '',
      c.metodo_pago ?? '',
      c.notas ?? '',
      c.origen ?? '',
      c.id,
    ]
  })

  const token = await getSheetsWriteToken()
  await ensureSheetExists(spreadsheetId, token, 'Backup Calendario')
  await clearAndWriteSheet(spreadsheetId, token, 'Backup Calendario', [header, ...rows])

  return { citasBackedUp: rows.length }
}

// ── Backup Clientes ──────────────────────────────────────────

export async function backupClientesToSheets(
  supabase: SupabaseClient
): Promise<{ clientesBackedUp: number }> {
  checkCredentials()
  const spreadsheetId = getSpreadsheetId()

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre')

  if (error) throw new Error(`Error fetching clientes: ${error.message}`)

  const header = ['Nombre', 'Teléfono', 'DNI', 'Email', 'Notas', 'Registrado desde', 'ID']

  const rows = (clientes || []).map((c) => [
    c.nombre,
    c.telefono ?? '',
    c.dni ?? '',
    c.email ?? '',
    c.notas ?? '',
    new Date(c.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    c.id,
  ])

  const token = await getSheetsWriteToken()
  await ensureSheetExists(spreadsheetId, token, 'Backup Clientes')
  await clearAndWriteSheet(spreadsheetId, token, 'Backup Clientes', [header, ...rows])

  return { clientesBackedUp: rows.length }
}
