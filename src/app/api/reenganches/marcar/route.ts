import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/reenganches/marcar
 * Body: { cita_id: string, enviado?: boolean }
 *
 * Marca al CLIENTE de esa cita como "reenganche enviado" (o revierte con enviado=false).
 * El estado vive en la tabla reenganches_enviados (indexada por cliente_id), NO en
 * la cita — esto asegura que el marcado sobreviva al sync diario de sheets que
 * borra e re-inserta citas.
 *
 * El cliente vuelve a ser candidato cuando su nueva visita es MAS NUEVA que
 * ultima_visita_al_enviar.
 */
export async function POST(request: NextRequest) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cita_id, enviado = true } = await request.json().catch(() => ({}))
  if (!cita_id || typeof cita_id !== 'string') {
    return NextResponse.json({ error: 'Falta cita_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Obtener el cliente y la fecha de esa cita
  const { data: cita, error: citaErr } = await admin
    .from('citas')
    .select('cliente_id, fecha_inicio')
    .eq('id', cita_id)
    .maybeSingle()

  if (citaErr || !cita || !cita.cliente_id) {
    return NextResponse.json({ error: 'Cita no encontrada o sin cliente asociado' }, { status: 404 })
  }

  if (enviado) {
    // Upsert: si ya existe registro para este cliente, actualizarlo con la nueva fecha.
    // Guardamos la fecha de ESTA visita como "ultima_visita_al_enviar" para que
    // el cliente vuelva a aparecer cuando venga a una visita posterior.
    const { error: upErr } = await admin
      .from('reenganches_enviados')
      .upsert({
        cliente_id: cita.cliente_id,
        sent_at: new Date().toISOString(),
        ultima_visita_al_enviar: cita.fecha_inicio,
        sent_by: user.email || null,
      }, { onConflict: 'cliente_id' })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  } else {
    // Revertir: eliminar el marcado. El cliente vuelve a ser candidato.
    const { error: delErr } = await admin
      .from('reenganches_enviados')
      .delete()
      .eq('cliente_id', cita.cliente_id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
