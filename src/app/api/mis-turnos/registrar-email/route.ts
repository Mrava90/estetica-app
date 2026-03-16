import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { email, citaId } = await request.json()

  if (!email || !citaId || !email.includes('@')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get cliente_id via cita
  const { data: cita } = await admin
    .from('citas')
    .select('cliente_id')
    .eq('id', citaId)
    .single()

  if (!cita?.cliente_id) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  // Only set email if not already set (don't overwrite existing)
  const { data: cliente } = await admin
    .from('clientes')
    .select('email')
    .eq('id', cita.cliente_id)
    .single()

  if (!cliente?.email) {
    await admin
      .from('clientes')
      .update({ email: email.trim().toLowerCase() })
      .eq('id', cita.cliente_id)
  }

  return NextResponse.json({ ok: true })
}
