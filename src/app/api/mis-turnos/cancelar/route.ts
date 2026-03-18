import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MIN_HOURS_TO_CANCEL = 24

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { citaId } = await request.json()
  if (!citaId) {
    return NextResponse.json({ error: 'citaId requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!cliente) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const { data: cita } = await admin
    .from('citas')
    .select('id, cliente_id, fecha_inicio, status')
    .eq('id', citaId)
    .single()

  if (!cita || cita.cliente_id !== cliente.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (cita.status === 'cancelada' || cita.status === 'completada') {
    return NextResponse.json({ error: 'No se puede cancelar este turno' }, { status: 400 })
  }

  const horasHastaElTurno = (new Date(cita.fecha_inicio).getTime() - Date.now()) / (1000 * 60 * 60)
  if (horasHastaElTurno < MIN_HOURS_TO_CANCEL) {
    return NextResponse.json(
      { error: `Solo podés cancelar con al menos ${MIN_HOURS_TO_CANCEL}hs de anticipación` },
      { status: 400 }
    )
  }

  await admin.from('citas').update({ status: 'cancelada' }).eq('id', citaId)

  return NextResponse.json({ ok: true })
}
