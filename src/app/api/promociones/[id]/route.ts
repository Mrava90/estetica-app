import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/constants'

async function assertAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { ok: false as const, status: 401, msg: 'No autorizado' }
  if (!isAdminEmail(user.email)) return { ok: false as const, status: 403, msg: 'Solo admin' }
  return { ok: true as const, user }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await assertAdmin()
  if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Solo permitir campos conocidos (whitelist)
  const patch: Record<string, unknown> = {}
  const CAMPOS = ['nombre', 'descripcion', 'descuento_pct', 'descuento_monto',
    'precios_override', 'metodo_pago_requerido', 'dias_semana',
    'hora_desde', 'hora_hasta', 'fecha_desde', 'fecha_hasta',
    'servicios_ids', 'profesionales_ids', 'imagen_url', 'activa']
  for (const c of CAMPOS) if (c in body) patch[c] = body[c]
  patch.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('promociones')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await assertAdmin()
  if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('promociones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
