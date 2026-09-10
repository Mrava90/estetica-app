/**
 * GET /api/facturacion/mp-status
 *
 * Diagnostico de la integracion con MercadoPago. Solo para staff logueado.
 * NUNCA devuelve el token — solo si esta presente, su largo y su prefijo.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { traerPagosDelMes } from '@/lib/mercadopago'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.MP_ACCESS_TOKEN
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  // 1. Variable presente
  if (!token) {
    checks.env = { ok: false, detail: 'MP_ACCESS_TOKEN no esta definida en el entorno' }
    return NextResponse.json({ ok: false, checks, runtime: process.env.VERCEL_ENV || 'local' })
  }
  checks.env = {
    ok: true,
    detail: `Presente · ${token.length} chars · prefijo "${token.slice(0, 8)}"`,
  }

  // 2. Formato
  const formatoOk = token.startsWith('APP_USR-') && token.length > 60
  checks.formato = {
    ok: formatoOk,
    detail: formatoOk
      ? 'Formato de Access Token de produccion'
      : `Formato sospechoso (esperado APP_USR-... de ~73 chars, hay ${token.length})`,
  }

  // 3. El token autentica
  try {
    const r = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (r.ok) {
      const j = await r.json()
      checks.auth = { ok: true, detail: `Autentica OK · cuenta "${j.nickname}" (id ${j.id}, ${j.site_id})` }
    } else {
      const txt = (await r.text()).slice(0, 200)
      checks.auth = { ok: false, detail: `HTTP ${r.status} · ${txt}` }
    }
  } catch (e: any) {
    checks.auth = { ok: false, detail: `Error de red: ${e.message}` }
  }

  // 4. Trae pagos del mes pedido (o el actual)
  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7)
  try {
    const t0 = Date.now()
    const pagos = await traerPagosDelMes(mes)
    const ms = Date.now() - t0
    const porTipo: Record<string, number> = {}
    for (const p of pagos) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1
    checks.pagos = {
      ok: pagos.length > 0,
      detail: pagos.length > 0
        ? `${pagos.length} pagos aprobados en ${mes} (${ms}ms) · ${JSON.stringify(porTipo)}`
        : `0 pagos en ${mes} (${ms}ms) — revisar si el mes tiene movimientos`,
    }
  } catch (e: any) {
    checks.pagos = { ok: false, detail: `Error: ${e.message}` }
  }

  const ok = Object.values(checks).every(c => c.ok)
  return NextResponse.json({ ok, checks, mes, runtime: process.env.VERCEL_ENV || 'local' })
}
