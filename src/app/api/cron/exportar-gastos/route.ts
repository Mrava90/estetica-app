/**
 * Exporta los gastos cargados en la app a la pestaña "PRUEBA - GASTOS APP".
 *
 * GET  → lo llama el cron de Vercel con el CRON_SECRET.
 * POST → lo dispara un admin desde /caja para ver el resultado al instante.
 *
 * Reescribe la pestaña entera en cada corrida, asi que correrlo dos veces no
 * duplica nada. NUNCA toca la hoja "Gastos" real.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'
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
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  try {
    const result = await exportarGastosAppASheet(createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[exportar-gastos]', err)
    return NextResponse.json({ error: err?.message || 'Error al exportar' }, { status: 500 })
  }
}
