import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/reenganches/marcar
 * Body: { cita_id: string, enviado?: boolean }
 *
 * Marca la cita como reenganche_enviado=true (default) o false (para revertir).
 * Al marcar, la cita queda fuera del listado permanentemente.
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
  const { error } = await admin
    .from('citas')
    .update({ reenganche_enviado: !!enviado })
    .eq('id', cita_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
