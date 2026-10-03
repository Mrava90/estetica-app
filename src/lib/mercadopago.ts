/**
 * Helper de MercadoPago — solo LECTURA de pagos recibidos (cobros del local).
 *
 * Se usa para enriquecer la facturacion: el sheet dice "MercadoPago" en todas
 * las filas, pero no distingue si el cobro entro por QR del local, por el
 * posnet Point, o por transferencia al alias. Esa diferencia importa porque
 * QR/Point pagan ~3% de comision y las transferencias no pagan nada.
 *
 * El token (MP_ACCESS_TOKEN) NUNCA sale del server. Si no esta configurado,
 * todas las funciones devuelven vacio y el modulo que las use tiene que
 * seguir funcionando igual (degradacion elegante).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const MP_API = 'https://api.mercadopago.com'

export type TipoPagoMP = 'QR' | 'Point' | 'Transferencia' | 'Link' | 'Dinero en cuenta' | 'Otro'

export interface PagoMP {
  id: number
  fecha: string          // ISO
  diaAR: string          // YYYY-MM-DD en hora Argentina
  monto: number          // bruto que pago el cliente
  comision: number       // lo que se lleva MP
  neto: number           // lo que realmente entro a la cuenta
  tipo: TipoPagoMP
  descripcion: string | null
  pagadorEmail: string | null
  pagadorDoc: string | null    // numero crudo que informa MP (suele ser CUIL)
  pagadorDni: string | null    // DNI extraido del CUIL, listo para la factura
  collectorId: number | null   // cuenta que RECIBIO la plata (la del local, si es un cobro)
}

/**
 * Extrae el DNI de un CUIL/CUIT.
 *
 * Los cobros QR traen `payer.identification.number` con el CUIL del pagador:
 * 11 digitos = prefijo (20/23/24/27) + DNI (8) + verificador (1).
 * Ej: 27408560301 → DNI 40856030
 *
 * Si el numero ya viene como DNI (7-8 digitos) se devuelve tal cual.
 * Cualquier otra cosa devuelve null — mejor facturar a Consumidor Final
 * que meter un documento invalido en ARCA.
 */
export function dniDesdeDocumento(doc: string | null | undefined): string | null {
  if (!doc) return null
  const n = String(doc).replace(/\D/g, '')
  if (n.length === 7 || n.length === 8) return n           // ya es un DNI
  if (n.length === 11 && /^(20|23|24|27|30|33|34)/.test(n)) {
    const dni = n.slice(2, 10).replace(/^0+/, '')
    return dni.length >= 7 ? dni : null
  }
  return null
}

/** Clasifica el canal de cobro segun point_of_interaction + payment_type. */
function clasificar(p: any): TipoPagoMP {
  const poi = p?.point_of_interaction?.type
  if (poi === 'INSTORE') return 'QR'
  if (poi === 'POINT') return 'Point'
  if (poi === 'PSP_TRANSFER') return 'Transferencia'
  if (poi === 'CHECKOUT') return 'Link'
  // Fallback cuando MP no informa point_of_interaction
  if (p?.payment_type_id === 'bank_transfer') return 'Transferencia'
  if (p?.payment_type_id === 'account_money') return 'Dinero en cuenta'
  return 'Otro'
}

/** YYYY-MM-DD en hora Argentina (evita off-by-one con el server en UTC). */
function diaAR(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

/**
 * Trae los pagos aprobados de un mes (YYYY-MM), paginando.
 * Devuelve [] si el token no esta configurado o si MP falla — nunca tira.
 */
export async function traerPagosDelMes(mes: string): Promise<PagoMP[]> {
  const [y, m] = mes.split('-').map(Number)
  if (!y || !m) return []
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return traerPagos(
    `${mes}-01T00:00:00.000-03:00`,
    `${mes}-${String(ultimoDia).padStart(2, '0')}T23:59:59.999-03:00`,
  )
}

/**
 * Trae los pagos aprobados de los ultimos N dias (contados en hora AR).
 * La usa el cron de facturacion automatica: no necesita releer todo el mes,
 * solo lo reciente.
 */
export async function traerPagosUltimosDias(dias: number): Promise<PagoMP[]> {
  const ahora = new Date()
  const desde = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000)
  const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: AR_TZ })
  return traerPagos(
    `${ymd(desde)}T00:00:00.000-03:00`,
    `${ymd(ahora)}T23:59:59.999-03:00`,
  )
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Base de las dos anteriores: busqueda en MP + memoria de pagos ya vistos.
 * Nunca tira — ante error devuelve lo que haya podido traer.
 *
 * /v1/payments/search NO es consistente: llamadas identicas y seguidas
 * devuelven al azar conjuntos distintos (medido el 15/9/2026: 46 o 43 pagos,
 * ~50% de las veces, y cuando falta algo son siempre los cobros por Point —
 * hasta el paging.total cambia). Es un problema entre replicas del lado de
 * MP y ninguna variante de la consulta lo evita. El GET por id si es
 * confiable. Entonces:
 *
 *   1. Se busca dos veces (en paralelo, es barato) y se une por id.
 *   2. Todo lo que vino se anota en mp_pagos_vistos.
 *   3. Lo que esta anotado para ese rango pero no vino, se trae por id.
 *
 * Un pago, una vez visto, no se pierde mas. Si la tabla no existe todavia
 * (migracion 00044 sin correr), se sigue con lo que devolvio la busqueda.
 */
export async function traerPagos(desde: string, hasta: string): Promise<PagoMP[]> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return []

  // 1. Busqueda, dos veces
  const porId = new Map<number, PagoMP>()
  const lotes = await Promise.all([traerPagosUnaVez(desde, hasta), traerPagosUnaVez(desde, hasta)])
  for (const lote of lotes) for (const p of lote) if (!porId.has(p.id)) porId.set(p.id, p)

  try {
    const admin = createAdminClient()

    // 2. Anotar los vistos
    if (porId.size > 0) {
      const { error } = await admin.from('mp_pagos_vistos').upsert(
        [...porId.values()].map(p => ({ id: p.id, fecha: p.fecha })),
        { onConflict: 'id', ignoreDuplicates: true },
      )
      if (error) throw error
    }

    // 3. Completar con los que la busqueda se olvido
    const { data: recordados, error } = await admin
      .from('mp_pagos_vistos').select('id').gte('fecha', desde).lte('fecha', hasta)
    if (error) throw error
    const faltantes = (recordados || []).map(r => Number(r.id)).filter(id => !porId.has(id))

    if (faltantes.length > 0) {
      const traidos = await Promise.all(faltantes.map(id => traerPagoPorId(id, token)))
      for (const p of traidos) if (p) porId.set(p.id, p)
      const idsAhora = new Set(traidos.filter(Boolean).map(p => p!.id))
      // Ya no esta aprobado (devuelto, cancelado): que no se vuelva a pedir.
      const olvidar = faltantes.filter(id => !idsAhora.has(id))
      if (olvidar.length > 0) await admin.from('mp_pagos_vistos').delete().in('id', olvidar)
      console.warn(`MP search omitio ${faltantes.length} pago(s) ya vistos; ${idsAhora.size} recuperados por id`)
    }
  } catch (e: any) {
    // Sin memoria (tabla inexistente, red) se sigue igual con lo buscado.
    console.error('MP memoria de pagos vistos no disponible:', e?.message || e)
  }

  // Solo cobros: afuera los pagos que hizo el local. Si no se pudo saber cual
  // es la cuenta propia, se devuelve todo, como antes.
  const propio = await idCuentaPropia(token)
  const cobros = [...porId.values()].filter(p => propio == null || p.collectorId == null || p.collectorId === propio)

  // Orden estable (mas reciente primero) para que el matcher sea determinista.
  return cobros.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** GET /v1/payments/:id — confiable, a diferencia de la busqueda. */
async function traerPagoPorId(id: number, token: string): Promise<PagoMP | null> {
  try {
    const res = await fetch(`${MP_API}/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return aPagoMP(await res.json())
  } catch {
    return null
  }
}

/** Convierte un pago crudo de MP a PagoMP. null si no esta aprobado. */
function aPagoMP(p: any): PagoMP | null {
  if (p?.status !== 'approved') return null
  const fecha = p.date_approved || p.date_created
  const comision = (p.fee_details || []).reduce((a: number, f: any) => a + (f.amount || 0), 0)
  const doc = p.payer?.identification?.number ?? null
  return {
    id: p.id,
    fecha,
    diaAR: diaAR(fecha),
    monto: p.transaction_amount || 0,
    comision,
    neto: p.transaction_details?.net_received_amount ?? ((p.transaction_amount || 0) - comision),
    tipo: clasificar(p),
    descripcion: p.description || null,
    pagadorEmail: p.payer?.email || null,
    pagadorDoc: doc ? String(doc) : null,
    pagadorDni: dniDesdeDocumento(doc),
    // En los cobros viene collector_id; en los pagos que hace el local viene
    // vacio y la cuenta destino esta en collector.id.
    collectorId: p.collector_id ?? p.collector?.id ?? null,
  }
}

/**
 * Id de la cuenta de MP del local (GET /users/me), una vez por proceso.
 * Hace falta porque /v1/payments/search devuelve tambien los pagos que HACE
 * el local (la nafta en la Shell por QR, transferencias salientes): sin
 * filtrarlos, un pago con QR en un comercio entraba como "cobro QR".
 */
let idPropioPromise: Promise<number | null> | null = null
function idCuentaPropia(token: string): Promise<number | null> {
  if (!idPropioPromise) {
    idPropioPromise = fetch(`${MP_API}/users/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (typeof j?.id === 'number' ? j.id : null))
      .catch(() => null)
      .then(id => { if (id == null) idPropioPromise = null; return id })   // reintentar la proxima vez
  }
  return idPropioPromise
}

/** Una sola pasada paginada por /v1/payments/search. Ver traerPagos. */
async function traerPagosUnaVez(desde: string, hasta: string): Promise<PagoMP[]> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return []

  const out: PagoMP[] = []
  let offset = 0
  const LIMIT = 50

  try {
    while (true) {
      const url = new URL(`${MP_API}/v1/payments/search`)
      url.searchParams.set('begin_date', desde)
      url.searchParams.set('end_date', hasta)
      url.searchParams.set('range', 'date_created')
      url.searchParams.set('sort', 'date_created')
      url.searchParams.set('criteria', 'desc')
      url.searchParams.set('limit', String(LIMIT))
      url.searchParams.set('offset', String(offset))

      // no-store a proposito: con `next: { revalidate }` Next cacheaba la
      // respuesta de cuando el token todavia no estaba configurado y seguia
      // devolviendo vacio. La latencia extra (~1s) es preferible a datos viejos.
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        console.error('MP payments/search fallo:', res.status, (await res.text()).slice(0, 200))
        return out  // devolvemos lo que se haya podido traer
      }
      const j = await res.json()
      const results = j?.results || []

      for (const p of results) {
        const pago = aPagoMP(p)
        if (pago) out.push(pago)
      }

      const total = j?.paging?.total ?? 0
      offset += LIMIT
      if (offset >= total || results.length === 0) break
      if (offset > 3000) break  // guarda contra loops
    }
  } catch (e) {
    console.error('MP traerPagosDelMes error:', e)
    return out
  }

  return out
}

export type MatchMP = 'unico' | 'ambiguo' | 'sin_match'

export interface ResultadoMatch {
  pago: PagoMP | null
  match: MatchMP
}

/**
 * Indexa pagos por "dia|monto redondeado" para cruzar contra filas del sheet.
 * Devuelve una funcion que consume pagos (no reutiliza el mismo pago para dos filas).
 */
export function crearMatcher(pagos: PagoMP[]) {
  const idx = new Map<string, PagoMP[]>()
  for (const p of pagos) {
    const k = `${p.diaAR}|${Math.round(p.monto)}`
    if (!idx.has(k)) idx.set(k, [])
    idx.get(k)!.push(p)
  }
  const usados = new Set<number>()

  return function match(fecha: string, monto: number): ResultadoMatch {
    const k = `${fecha}|${Math.round(monto)}`
    const cands = (idx.get(k) || []).filter(p => !usados.has(p.id))
    if (cands.length === 0) return { pago: null, match: 'sin_match' }
    usados.add(cands[0].id)
    return { pago: cands[0], match: cands.length === 1 ? 'unico' : 'ambiguo' }
  }
}
