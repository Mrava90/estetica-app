import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/promociones/activas
 * Público — devuelve las promos activas y vigentes hoy en adelante.
 * Usado por /reservar (client-side) para calcular descuentos y mostrar banner.
 */
export async function GET() {
  const admin = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('promociones')
    .select('*')
    .eq('activa', true)
    .or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
