import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!cliente) {
    return NextResponse.json({ citas: [] })
  }

  const { data: citas } = await admin
    .from('citas')
    .select('*, servicios(*), profesionales(*)')
    .eq('cliente_id', cliente.id)
    .order('fecha_inicio', { ascending: false })
    .limit(50)

  return NextResponse.json({ citas: citas || [] })
}
