/**
 * Plantillas de Servicios > Mails (ver migracion 00049). Solo admin.
 *
 * GET              → todas
 * POST             → crear { nombre, asunto, cuerpo, promocion_id? }
 * PUT              → editar { id, nombre, asunto, cuerpo, promocion_id? }
 * DELETE ?id=      → borrar (el historial queda, sin plantilla)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'

export const dynamic = 'force-dynamic'

async function esAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user && isAdminUser(user)
}

function validar(b: { nombre?: string; asunto?: string; cuerpo?: string }) {
  if (!b.nombre?.trim() || !b.asunto?.trim() || !b.cuerpo?.trim()) return 'Faltan el nombre, el asunto o el texto'
  return null
}

export async function GET() {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const { data, error } = await createAdminClient().from('mail_plantillas').select('*, promociones(nombre, imagen_url)').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantillas: data })
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const b = await request.json()
  const err = validar(b)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { data, error } = await createAdminClient().from('mail_plantillas').insert({
    nombre: b.nombre.trim().slice(0, 80), asunto: b.asunto.trim().slice(0, 150), cuerpo: b.cuerpo.trim().slice(0, 8000),
    promocion_id: b.promocion_id || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PUT(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const b = await request.json()
  const err = validar(b) || (!b.id ? 'Falta id' : null)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { error } = await createAdminClient().from('mail_plantillas').update({
    nombre: b.nombre.trim().slice(0, 80), asunto: b.asunto.trim().slice(0, 150), cuerpo: b.cuerpo.trim().slice(0, 8000),
    promocion_id: b.promocion_id || null,
    updated_at: new Date().toISOString(),
  }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await createAdminClient().from('mail_plantillas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
