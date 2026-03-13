import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = getSupabase()

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const headers = ['Nombre', 'Teléfono', 'DNI', 'Email', 'Notas', 'Registrado desde']

  const rows = (clientes || []).map((c) => [
    c.nombre,
    c.telefono ?? '',
    c.dni ?? '',
    c.email ?? '',
    c.notas ?? '',
    new Date(c.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
  ])

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\r\n')

  // BOM UTF-8 para que Excel lo abra correctamente con tildes
  const bom = '\uFEFF'
  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="Clientes-${today}.csv"`,
    },
  })
}
