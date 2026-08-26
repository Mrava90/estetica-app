import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/constants'

async function checkAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { ok: false, status: 401 as const, error: 'No autorizado' }
  if (!isAdminUser(user)) return { ok: false, status: 403 as const, error: 'Solo admin' }
  return { ok: true as const, email: user.email! }
}

export async function GET() {
  const check = await checkAdmin()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('facturacion_manual')
    .select('*')
    .order('fecha', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: Request) {
  const check = await checkAdmin()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const { fecha, monto, nota } = await request.json()

  if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  }
  const m = Number(monto)
  if (isNaN(m) || m < 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('facturacion_manual')
    .insert({ fecha, monto: m, nota: nota?.toString().slice(0, 200) || null, created_by: check.email })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: Request) {
  const check = await checkAdmin()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('facturacion_manual').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
