import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/constants'
import { consultarPadron } from '@/lib/afip/padron'

/**
 * GET /api/afip/padron
 *   Devuelve el snapshot más reciente + facturado semestre actual.
 *
 * POST /api/afip/padron
 *   Fuerza nueva consulta a AFIP, guarda snapshot, devuelve resultado.
 *   Solo admin.
 */

function inicioSemestre(): Date {
  const now = new Date()
  const mes = now.getMonth() // 0-11
  const anio = now.getFullYear()
  // Semestre 1: enero-junio, Semestre 2: julio-diciembre
  if (mes < 6) return new Date(anio, 0, 1)
  return new Date(anio, 6, 1)
}

function ultimos12Meses(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - 12)
  return d
}

interface MesFacturado {
  mes: string  // 'YYYY-MM'
  afip: number
  manual: number
  total: number
}

async function getFacturadoTotales(admin: ReturnType<typeof createAdminClient>) {
  const desdeSemestre = inicioSemestre().toISOString().slice(0, 10)
  const desde12m = ultimos12Meses().toISOString().slice(0, 10)

  // Traer TODOS los registros de los últimos 12 meses (con fecha) para poder
  // calcular tanto totales como desglose mensual.
  const [{ data: fac12 }, { data: man12 }] = await Promise.all([
    admin.from('facturas').select('fecha, monto').eq('estado', 'emitida').gte('fecha', desde12m),
    admin.from('facturacion_manual').select('fecha, monto').gte('fecha', desde12m),
  ])

  const sumPredicate = (rows: { fecha: string; monto: number | null }[] | null, fromDate: string) =>
    (rows || []).filter((r) => r.fecha >= fromDate).reduce((acc, r) => acc + (Number(r.monto) || 0), 0)

  const facSemestre = sumPredicate(fac12, desdeSemestre)
  const facAnual = sumPredicate(fac12, desde12m)
  const manSemestre = sumPredicate(man12, desdeSemestre)
  const manAnual = sumPredicate(man12, desde12m)

  // Construir mapa de meses (12 últimos)
  const mesesMap = new Map<string, MesFacturado>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    mesesMap.set(key, { mes: key, afip: 0, manual: 0, total: 0 })
  }

  for (const f of fac12 || []) {
    const key = f.fecha.slice(0, 7)
    const m = mesesMap.get(key)
    if (m) {
      m.afip += Number(f.monto) || 0
      m.total = m.afip + m.manual
    }
  }
  for (const f of man12 || []) {
    const key = f.fecha.slice(0, 7)
    const m = mesesMap.get(key)
    if (m) {
      m.manual += Number(f.monto) || 0
      m.total = m.afip + m.manual
    }
  }

  return {
    semestre: facSemestre + manSemestre,
    ultimos12Meses: facAnual + manAnual,
    facturasSemestre: facSemestre,
    facturasUltimos12Meses: facAnual,
    manualSemestre: manSemestre,
    manualUltimos12Meses: manAnual,
    porMes: Array.from(mesesMap.values()),
  }
}

export async function GET() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const admin = createAdminClient()

  const [{ data: snapshot }, { data: config }] = await Promise.all([
    admin.from('afip_padron_snapshot').select('*').order('consultado_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('configuracion').select('categoria_monotributo_manual').eq('id', 1).maybeSingle(),
  ])

  const facturado = await getFacturadoTotales(admin)

  return NextResponse.json({
    snapshot,
    facturado,
    categoriaManual: config?.categoria_monotributo_manual || null,
  })
}

export async function PATCH(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const { categoria } = await request.json()
  if (categoria && !/^[A-K]$/.test(categoria)) {
    return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('configuracion')
    .update({ categoria_monotributo_manual: categoria || null, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  if (!process.env.AFIP_CUIT || !process.env.AFIP_CERT || !process.env.AFIP_KEY) {
    return NextResponse.json({ error: 'Faltan credenciales AFIP' }, { status: 503 })
  }

  const admin = createAdminClient()

  try {
    const data = await consultarPadron()

    // Detectar cambio de categoría
    const { data: ultimo } = await admin
      .from('afip_padron_snapshot')
      .select('categoria_monotributo')
      .order('consultado_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cambioDesde =
      ultimo?.categoria_monotributo &&
      data.categoriaMonotributo &&
      ultimo.categoria_monotributo !== data.categoriaMonotributo
        ? ultimo.categoria_monotributo
        : null

    const { error: insErr } = await admin.from('afip_padron_snapshot').insert({
      cuit: data.cuit,
      estado_clave: data.estadoClave,
      tipo_persona: data.tipoPersona,
      razon_social: data.razonSocial,
      nombre: data.nombre,
      apellido: data.apellido,
      categoria_monotributo: data.categoriaMonotributo,
      categoria_id: data.categoriaId,
      impuestos: data.impuestos,
      actividades: data.actividades,
      domicilios: data.domicilios,
      raw_response: { xml: data.rawXml.slice(0, 50_000) },
      cambio_categoria_desde: cambioDesde,
    })

    if (insErr) throw insErr

    const facturado = await getFacturadoTotales(admin)

    return NextResponse.json({
      ok: true,
      data: { ...data, rawXml: undefined },
      cambio_categoria_desde: cambioDesde,
      facturado,
    })
  } catch (err: any) {
    console.error('Error consultando padrón:', err)
    // No filtramos el detalle del error AFIP al cliente. Solo casos comunes con
    // mensajes seguros, todo lo demás se loguea server-side y se devuelve mensaje genérico.
    const msg = String(err?.message || '')
    let safeError = 'Error consultando AFIP. Revisar logs.'
    if (msg.includes('Computador no autorizado')) safeError = 'El servicio ws_sr_padron_a13 no está habilitado para este certificado en AFIP.'
    else if (msg.includes('credenciales')) safeError = 'Faltan credenciales AFIP configuradas.'
    return NextResponse.json({ error: safeError }, { status: 500 })
  }
}
