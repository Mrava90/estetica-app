/**
 * POST /api/novedades/vista { id } — la usuaria logueada cerro la novedad.
 * Desde ahi no se le vuelve a mostrar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await createAdminClient().from('novedades_vistas').upsert(
    { novedad_id: id, user_id: user.id, email: user.email },
    { onConflict: 'novedad_id,user_id', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
