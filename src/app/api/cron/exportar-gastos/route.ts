/**
 * Exporta los gastos cargados en la app a la pestaña "PRUEBA - GASTOS APP".
 *
 * GET  → lo llama el cron de Vercel con el CRON_SECRET.
 * POST → lo dispara /caja: el boton del admin, y ademas en automatico despues
 *        de cada alta o baja de movimiento (ahi va silencioso).
 *
 * Reescribe la pestaña entera en cada corrida, asi que correrlo dos veces no
 * duplica nada. NUNCA toca la hoja "Gastos" real.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStaffUser } from '@/lib/constants'
import { withCronLog } from '@/lib/cron-logger'
import { exportarGastosAppASheet } from '@/lib/gastos-export'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await withCronLog('exportar-gastos', () =>
      exportarGastosAppASheet(createAdminClient())
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[cron exportar-gastos]', err)
    return NextResponse.json({ error: err?.message || 'Error al exportar' }, { status: 500 })
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Staff, no solo admin: /caja lo dispara solo despues de cargar o borrar un
  // gasto, y ahi puede estar cualquiera del personal. La operacion reescribe
  // siempre la misma pestaña de prueba con datos de la app, asi que repetirla
  // no rompe nada.
  if (!isStaffUser(user)) return NextResponse.json({ error: 'Solo personal' }, { status: 403 })

  try {
    const result = await exportarGastosAppASheet(createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[exportar-gastos]', err)
    return NextResponse.json({ error: err?.message || 'Error al exportar' }, { status: 500 })
  }
}
