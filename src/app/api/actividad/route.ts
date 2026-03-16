import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminEmail } from '@/lib/constants'

export async function GET(request: NextRequest) {
  // Verify admin session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const admin = createAdminClient()

  const { data: logs, error } = await admin
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch client names for all registro_ids
  const registroIds = [...new Set((logs ?? []).map(l => l.registro_id).filter(Boolean))]
  let clienteMap: Record<string, { nombre: string; apellido: string | null }> = {}

  if (registroIds.length > 0) {
    const { data: citas } = await admin
      .from('citas')
      .select('id, cliente_id, clientes(nombre, apellido)')
      .in('id', registroIds)
    ;(citas ?? []).forEach((c: { id: string; clientes: { nombre: string; apellido: string | null } | null }) => {
      if (c.clientes) clienteMap[c.id] = c.clientes
    })
  }

  const enriched = (logs ?? []).map(log => ({
    ...log,
    cliente: clienteMap[log.registro_id] ?? null,
  }))

  return NextResponse.json({ logs: enriched })
}
