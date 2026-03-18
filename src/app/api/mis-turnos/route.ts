import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 401 })

  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes')
    .select('id, email, nombre')
    .eq('access_token', token)
    .gte('access_token_expires_at', new Date().toISOString())
    .single()

  if (!cliente) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  const { data: citas } = await admin
    .from('citas')
    .select('*, servicios(*), profesionales(*)')
    .eq('cliente_id', cliente.id)
    .order('fecha_inicio', { ascending: false })
    .limit(50)

  return NextResponse.json({ citas: citas || [], cliente })
}
