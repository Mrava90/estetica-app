/**
 * Novedades del sistema para el personal (ver migracion 00045).
 *
 * GET  ?modo=pendientes → las que la usuaria logueada todavia no cerro
 * GET  ?modo=admin      → todas, con quien las vio (solo admin)
 * POST                  → crear una (solo admin)
 * DELETE ?id=           → borrar una (solo admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser, isStaffUser } from '@/lib/constants'

export const dynamic = 'force-dynamic'

async function usuario() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(request: NextRequest) {
  const user = await usuario()
  if (!user || !isStaffUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const admin = createAdminClient()
  const modo = request.nextUrl.searchParams.get('modo') || 'pendientes'

  if (modo === 'admin') {
    if (!isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
    const { data, error } = await admin
      .from('novedades')
      .select('id, titulo, cuerpo, destinatarios, created_at, novedades_vistas(email, vista_at)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ novedades: data })
  }

  // Pendientes: dirigidas a esta usuaria (o a todas) y que no cerro.
  const email = (user.email || '').toLowerCase()
  const [{ data: todas, error }, { data: vistas }] = await Promise.all([
    admin.from('novedades').select('id, titulo, cuerpo, destinatarios, created_at').order('created_at', { ascending: true }).limit(50),
    admin.from('novedades_vistas').select('novedad_id').eq('user_id', user.id),
  ])
  if (error) return NextResponse.json({ novedades: [] })   // sin tabla todavia: no molestar
  const yaVistas = new Set((vistas || []).map(v => v.novedad_id))
  // created_at hace de "mostrar desde": una novedad programada (fecha futura)
  // no se muestra hasta esa hora.
  const ahora = Date.now()
  const pendientes = (todas || []).filter(n =>
    new Date(n.created_at).getTime() <= ahora &&
    !yaVistas.has(n.id) &&
    (!n.destinatarios || n.destinatarios.map((d: string) => d.toLowerCase()).includes(email)))
  return NextResponse.json({ novedades: pendientes.map(n => ({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, created_at: n.created_at })) })
}

export async function POST(request: NextRequest) {
  const user = await usuario()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const { titulo, cuerpo, destinatarios, mostrar_desde } = await request.json()
  // Opcional: ISO con zona. Se guarda en created_at (ver GET pendientes).
  const desde = mostrar_desde && !isNaN(new Date(mostrar_desde).getTime()) ? new Date(mostrar_desde).toISOString() : null
  if (!titulo?.trim() || !cuerpo?.trim()) return NextResponse.json({ error: 'Falta el título o el mensaje' }, { status: 400 })
  const lista = Array.isArray(destinatarios) ? destinatarios.filter((d: unknown) => typeof d === 'string' && d.includes('@')) : []
  if (lista.length === 0) return NextResponse.json({ error: 'Elegí al menos una destinataria' }, { status: 400 })

  const { data, error } = await createAdminClient().from('novedades').insert({
    titulo: titulo.trim().slice(0, 120),
    cuerpo: cuerpo.trim().slice(0, 4000),
    destinatarios: lista.map((d: string) => d.toLowerCase()),
    creado_por: user.id,
    ...(desde ? { created_at: desde } : {}),
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(request: NextRequest) {
  const user = await usuario()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await createAdminClient().from('novedades').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
