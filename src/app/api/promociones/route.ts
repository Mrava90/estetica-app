import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/constants'

async function assertAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { ok: false as const, status: 401, msg: 'No autorizado' }
  if (!isAdminUser(user)) return { ok: false as const, status: 403, msg: 'Solo admin' }
  return { ok: true as const, user }
}

function validarBody(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Body inválido'
  if (!body.nombre || typeof body.nombre !== 'string') return 'Falta nombre'

  const pct = body.descuento_pct != null ? Number(body.descuento_pct) : null
  const monto = body.descuento_monto != null ? Number(body.descuento_monto) : null
  const override = body.precios_override && typeof body.precios_override === 'object'
    ? body.precios_override
    : null
  const overrideValidos = override
    ? Object.values(override).filter((v: any) => Number(v) > 0).length
    : 0

  // Al menos uno de los 3 mecanismos de descuento debe estar seteado
  if (pct == null && monto == null && overrideValidos === 0) {
    return 'Falta descuento (% uniforme, monto fijo o precios por servicio)'
  }

  if (pct != null && (isNaN(pct) || pct <= 0 || pct > 100)) return 'Descuento % inválido (1-100)'
  if (monto != null && (isNaN(monto) || monto <= 0)) return 'Monto de descuento inválido'
  if (pct != null && monto != null) return 'Elegí solo uno: % o monto (no ambos)'
  return null
}

function normalizar(body: any) {
  // Sanitizar precios_override: {uuid: number>0}
  let precios_override: Record<string, number> | null = null
  if (body.precios_override && typeof body.precios_override === 'object') {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.precios_override)) {
      const n = Number(v)
      if (n > 0) clean[k] = n
    }
    if (Object.keys(clean).length > 0) precios_override = clean
  }

  return {
    nombre: String(body.nombre).trim().slice(0, 100),
    descripcion: body.descripcion ? String(body.descripcion).trim().slice(0, 500) : null,
    descuento_pct: body.descuento_pct != null ? Number(body.descuento_pct) : null,
    descuento_monto: body.descuento_monto != null ? Number(body.descuento_monto) : null,
    precios_override,
    metodo_pago_requerido: body.metodo_pago_requerido || null,
    dias_semana: Array.isArray(body.dias_semana) && body.dias_semana.length > 0
      ? body.dias_semana.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6)
      : null,
    hora_desde: body.hora_desde || null,
    hora_hasta: body.hora_hasta || null,
    fecha_desde: body.fecha_desde || null,
    fecha_hasta: body.fecha_hasta || null,
    servicios_ids: Array.isArray(body.servicios_ids) && body.servicios_ids.length > 0 ? body.servicios_ids : null,
    profesionales_ids: Array.isArray(body.profesionales_ids) && body.profesionales_ids.length > 0 ? body.profesionales_ids : null,
    imagen_url: body.imagen_url ? String(body.imagen_url).trim().slice(0, 500) : null,
    activa: body.activa !== false,
  }
}

export async function GET() {
  const check = await assertAdmin()
  if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('promociones')
    .select('*')
    .order('activa', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const check = await assertAdmin()
  if (!check.ok) return NextResponse.json({ error: check.msg }, { status: check.status })

  const body = await request.json().catch(() => null)
  const err = validarBody(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('promociones')
    .insert(normalizar(body))
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
