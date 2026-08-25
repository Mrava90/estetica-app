import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/constants'

/**
 * POST /api/servicios/aumento-masivo
 * Body: { porcentaje: number }
 *
 * Aplica un aumento porcentual a TODOS los servicios activos.
 * Guarda el snapshot anterior en precios_historial para poder revertir.
 */
export async function POST(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const pct = Number(body?.porcentaje)
  if (!isFinite(pct) || pct === 0 || pct < -50 || pct > 200) {
    return NextResponse.json({ error: 'Porcentaje inválido (debe estar entre -50 y 200)' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Aplicar en UNA transaccion via RPC. Si algo falla, revierte todo (ACID).
  // Antes teniamos historial + N updates individuales -> podia quedar inconsistente
  // si un update fallaba a mitad de camino.
  const { data: affected, error: rpcErr } = await admin.rpc('apply_bulk_price_change', {
    p_pct: pct,
    p_changed_by: user.email,
  })

  if (rpcErr) {
    return NextResponse.json({ error: 'Error al aplicar aumento: ' + rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: affected ?? 0 })
}

/**
 * GET /api/servicios/aumento-masivo?recientes=1
 * Devuelve los últimos lotes de aumento masivo agrupados por porcentaje + fecha.
 * Útil para mostrar "Revertir último aumento".
 */
export async function GET() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('precios_historial')
    .select('porcentaje, motivo, created_at, changed_by')
    .not('porcentaje', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupar por timestamp redondeado al minuto (un lote = todo lo que se aplicó al mismo tiempo)
  const lotes: Array<{ porcentaje: number; created_at: string; count: number; changed_by: string }> = []
  const vistos = new Set<string>()
  for (const row of data || []) {
    const key = `${row.created_at.slice(0, 16)}_${row.porcentaje}`
    if (vistos.has(key)) {
      lotes[lotes.length - 1].count++
    } else {
      vistos.add(key)
      lotes.push({
        porcentaje: row.porcentaje,
        created_at: row.created_at,
        count: 1,
        changed_by: row.changed_by,
      })
    }
  }

  return NextResponse.json({ lotes })
}

/**
 * DELETE /api/servicios/aumento-masivo?desde=2026-05-21T10:00:00Z
 * Revierte todos los cambios de precios_historial desde esa fecha,
 * volviendo los precios al "anterior".
 */
export async function DELETE(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const desde = searchParams.get('desde')
  if (!desde) return NextResponse.json({ error: 'Falta parámetro "desde"' }, { status: 400 })
  // Validar formato ISO 8601 (YYYY-MM-DDTHH:MM:SS[.sss][Z|±HH:MM])
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(desde) || isNaN(new Date(desde).getTime())) {
    return NextResponse.json({ error: 'Formato de fecha inválido (usar ISO 8601)' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Reversion atomica via RPC. El log de auditoria queda con los precios REALES
  // antes de revertir (no placeholders 0 como antes).
  const { data: reverted, error: rpcErr } = await admin.rpc('revert_price_changes', {
    p_since: desde,
    p_changed_by: user.email,
  })

  if (rpcErr) {
    return NextResponse.json({ error: 'Error al revertir: ' + rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reverted: reverted ?? 0 })
}
