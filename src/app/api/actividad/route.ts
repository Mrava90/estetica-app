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
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const admin = createAdminClient()

  let query = admin
    .from('audit_log')
    .select('*')
    .not('usuario_email', 'is', null) // excluir entradas del sistema (sync sheets, etc.)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (desde) query = query.gte('created_at', `${desde}T00:00:00`)
  if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`)

  const { data: logs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch client names for all registro_ids
  const registroIds = [...new Set((logs ?? []).map(l => l.registro_id).filter(Boolean))]
  let clienteMap: Record<string, { nombre: string; apellido: string | null }> = {}

  if (registroIds.length > 0) {
    const { data: citas } = await admin
      .from('citas')
      .select('id, cliente_id, clientes(nombre, apellido)')
      .in('id', registroIds)
    ;(citas ?? []).forEach((c) => {
      const cl = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes
      if (cl) clienteMap[c.id] = cl
    })
  }

  const enriched = (logs ?? []).map(log => ({
    ...log,
    cliente: clienteMap[log.registro_id] ?? null,
  }))

  return NextResponse.json({ logs: enriched })
}
