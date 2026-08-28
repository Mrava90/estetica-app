import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/reenganches/marcar
 * Body:
 *   { cliente_id: uuid, fecha_visita: iso, enviado?: boolean }
 *     - Preferido: no depende de que la cita siga existiendo. El sync de sheets
 *       borra e re-inserta citas todos los dias -> el cita_id puede volverse
 *       stale entre que el frontend carga la lista y clickea WhatsApp.
 *   { cita_id: uuid, enviado?: boolean }  (legacy, fallback)
 *     - Se resuelve cliente_id + fecha_inicio desde la cita si esta existe.
 *
 * El marcado vive en la tabla reenganches_enviados (indexada por cliente_id),
 * NO en la cita — asi sobrevive al sync diario.
 */
export async function POST(request: NextRequest) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const enviado = body.enviado !== false
  const admin = createAdminClient()

  let clienteId: string | null = body.cliente_id || null
  let fechaVisita: string | null = body.fecha_visita || null

  // Fallback legacy: si vino solo cita_id, resolver cliente_id + fecha desde citas.
  if (!clienteId && body.cita_id && typeof body.cita_id === 'string') {
    const { data: cita } = await admin
      .from('citas')
      .select('cliente_id, fecha_inicio')
      .eq('id', body.cita_id)
      .maybeSingle()
    if (cita?.cliente_id) {
      clienteId = cita.cliente_id
      fechaVisita = cita.fecha_inicio
    }
  }

  if (!clienteId) {
    return NextResponse.json({ error: 'Falta cliente_id (o cita_id resolvible)' }, { status: 400 })
  }

  if (enviado) {
    if (!fechaVisita) {
      return NextResponse.json({ error: 'Falta fecha_visita' }, { status: 400 })
    }
    const { error: upErr } = await admin
      .from('reenganches_enviados')
      .upsert({
        cliente_id: clienteId,
        sent_at: new Date().toISOString(),
        ultima_visita_al_enviar: fechaVisita,
        sent_by: user.email || null,
      }, { onConflict: 'cliente_id' })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  } else {
    const { error: delErr } = await admin
      .from('reenganches_enviados')
      .delete()
      .eq('cliente_id', clienteId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
