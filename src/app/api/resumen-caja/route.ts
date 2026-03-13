import { NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@/lib/supabase/server'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

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

// Parsea 'DD/MM' devolviendo { day, month }
function parseDDMM(str: string): { day: number; month: number } | null {
  const match = str.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null
  return { day: parseInt(match[1]), month: parseInt(match[2]) }
}

export async function GET(request: Request) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  // mes en formato YYYY-MM (default: mes actual)
  const now = new Date()
  const mesParam = searchParams.get('mes') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yearStr, monthStr] = mesParam.split('-')
  const targetMonth = parseInt(monthStr)

  try {
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

    const range = encodeURIComponent(`'Resumen caja diaria'!A:D`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    const rows: string[][] = data.values || []

    let efectivo = 0
    let mercadopago = 0

    for (const row of rows) {
      const col0 = (row[0] || '').trim()
      if (!col0) continue
      const parsed = parseDDMM(col0)
      if (!parsed) continue
      if (parsed.month !== targetMonth) continue

      efectivo += parseAmount(row[1] || '0')
      mercadopago += parseAmount(row[2] || '0')
    }

    return NextResponse.json({ efectivo: Math.round(efectivo), mercadopago: Math.round(mercadopago) })
  } catch (err) {
    console.error('resumen-caja error:', err)
    return NextResponse.json({ efectivo: 0, mercadopago: 0, error: String(err) }, { status: 500 })
  }
}
