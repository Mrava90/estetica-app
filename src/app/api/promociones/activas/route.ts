import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fechaArYMD } from '@/lib/timezone'

/**
 * GET /api/promociones/activas
 * Público — devuelve las promos activas y vigentes hoy en adelante.
 * Usado por /reservar (client-side) para calcular descuentos y mostrar banner.
 */
export async function GET() {
  const admin = createAdminClient()
  // Fecha en AR — si usamos UTC, entre 21:00 y 00:00 AR se pierde el dia actual
  // porque UTC ya paso al siguiente y una promo con fecha_hasta = hoy se filtra fuera.
  const hoy = fechaArYMD()

  const { data, error } = await admin
    .from('promociones')
    .select('*')
    .eq('activa', true)
    .or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
