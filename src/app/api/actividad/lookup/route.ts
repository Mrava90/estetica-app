import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'

/**
 * GET /api/actividad/lookup?tipo=profesionales|servicios
 * Devuelve la lista mínima (id + nombre) para resolver IDs en la página de actividad.
 * Solo staff/admin (autenticado). No incluye info sensible.
 */
export async function GET(request: NextRequest) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo admin puede ver actividad (mismo criterio que /api/actividad)
  const isStaff = user.email?.endsWith('@estetica.local') ?? false
  if (!isAdminUser(user) && !isStaff) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const tipo = request.nextUrl.searchParams.get('tipo')
  if (tipo !== 'profesionales' && tipo !== 'servicios') {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (tipo === 'profesionales') {
    const { data } = await admin.from('profesionales').select('id, nombre').order('nombre')
    return NextResponse.json({ items: data || [] })
  }

  const { data } = await admin.from('servicios').select('id, nombre, duracion_minutos').order('nombre')
  return NextResponse.json({ items: data || [] })
}
