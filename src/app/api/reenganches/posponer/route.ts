import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Posponer una alerta de reenganche (tabla reenganches_pospuestos).
 *
 * POST   { cliente_id, hasta: 'YYYY-MM-DD', nota?, fecha_visita, servicio_nombre?, profesional_nombre? }
 *        → la alerta se oculta hasta esa fecha y ese dia vuelve a Pendientes.
 *          Si ya estaba pospuesta, se reemplaza la fecha.
 * DELETE { cliente_id } → quita la postergacion.
 */

async function staff() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

export async function POST(request: NextRequest) {
  const user = await staff()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (!b.cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.hasta || '')) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  if (!b.fecha_visita) return NextResponse.json({ error: 'Falta fecha_visita' }, { status: 400 })

  const { error } = await createAdminClient().from('reenganches_pospuestos').upsert({
    cliente_id: b.cliente_id,
    hasta: b.hasta,
    nota: typeof b.nota === 'string' && b.nota.trim() ? b.nota.trim().slice(0, 200) : null,
    ultima_visita: b.fecha_visita,
    servicio_nombre: b.servicio_nombre || null,
    profesional_nombre: b.profesional_nombre || null,
    creado_por: user.email || null,
    created_at: new Date().toISOString(),
  }, { onConflict: 'cliente_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const user = await staff()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  if (!b.cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })
  const { error } = await createAdminClient().from('reenganches_pospuestos').delete().eq('cliente_id', b.cliente_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
