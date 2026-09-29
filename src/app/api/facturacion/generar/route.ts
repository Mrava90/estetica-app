/**
 * API Route: POST /api/facturacion/generar
 *
 * Genera una factura electrónica en ARCA (ex-AFIP) para una cita
 * pagada con MercadoPago y guarda el CAE en la tabla `facturas`.
 *
 * ── Flujo de autenticación ARCA ──────────────────────────────────────────
 *  1. Firmar un LoginTicketRequest XML con la clave privada (RSA SHA-256)
 *  2. Enviar al WSAA para obtener Token + Signature (válidos 12 h)
 *  3. Usar Token + Signature + CUIT para llamar a WSFEV1
 *  4. WSFEV1 responde con el CAE (14 dígitos) y su fecha de vencimiento
 *
 * ── Variables de entorno requeridas ────────────────────────────────────
 *  AFIP_CUIT            Ej: 20123456780
 *  AFIP_CERT            Certificado X.509 en PEM (BEGIN CERTIFICATE…)
 *  AFIP_KEY             Clave privada RSA en PEM (BEGIN PRIVATE KEY…)
 *  AFIP_PUNTO_VENTA     Número de punto de venta (Ej: 1)
 *  AFIP_TIPO_CBTE       Tipo de comprobante (11=Fctura C, 6=Fctura B, 1=Fctura A)
 *  AFIP_PROD            "true" para producción, "false" para homologación/testing
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/constants'
import { timingSafeEqual } from 'crypto'
import {
  isProd,
  getAuthTicket,
  invalidateAuthCache,
  isAuthErrorAfip,
  getUltimoComprobante,
  autorizarComprobante,
} from '@/lib/afip/wsfe'
import { buscarPosibleDuplicado } from '@/lib/facturacion-match'


// ── Supabase admin client ─────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}


// ── Endpoint principal ───────────────────────────────────────────────────

export async function POST(request: Request) {
  // Dos vias de autenticacion:
  //  1. Sesion de usuario admin (uso normal desde /facturacion)
  //  2. CRON_SECRET (facturacion automatica de cobros QR, /api/cron/facturar-qr)
  // El secreto del cron se compara con timingSafeEqual para no filtrar
  // informacion por el tiempo de respuesta.
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')
  let esCron = false
  if (headerSecret && cronSecret && cronSecret.length >= 16) {
    const a = Buffer.from(headerSecret)
    const b = Buffer.from(cronSecret)
    esCron = a.length === b.length && timingSafeEqual(a, b)
  }

  if (!esCron) {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!isAdminUser(user)) {
      return NextResponse.json({ error: 'Solo el admin puede emitir facturas' }, { status: 403 })
    }
  }

  const body = await request.json()
  const { cita_id, afip_row_key, mp_payment_id, receptor_nombre, receptor_dni, monto, fecha, descripcion } = body

  // Tres origenes posibles: una cita de la app, una fila del sheet, o un cobro
  // de MercadoPago (facturacion automatica de QR).
  if ((!cita_id && !afip_row_key && !mp_payment_id) || !monto || !fecha) {
    return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Verificar que no tenga ya una factura emitida
  const query = supabase.from('facturas').select('id, estado').eq('estado', 'emitida')
  if (mp_payment_id)     query.eq('mp_payment_id', mp_payment_id)
  else if (afip_row_key) query.eq('afip_row_key', afip_row_key)
  else                   query.eq('cita_id', cita_id)
  const { data: existing } = await query.maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Ya existe una factura emitida para este ítem.' }, { status: 409 })
  }

  // Anti-duplicado por contenido. La clave del item puede no coincidir con la
  // de una factura ya emitida para la misma venta: fila del sheet corrida,
  // nombre corregido, o facturada antes a mano. Fecha (±3 dias) + monto +
  // nombre o DNI parecido si identifican la venta. `forzar` lo saltea cuando
  // el admin confirma que es otra venta (misma clienta, mismo importe).
  if (!body.forzar) {
    const dia = (d: number) => new Date(new Date(fecha + 'T12:00:00Z').getTime() + d * 86_400_000).toISOString().slice(0, 10)
    const { data: emitidas } = await supabase
      .from('facturas')
      .select('id, afip_row_key, fecha, monto, receptor_nombre, receptor_dni, numero_cbte')
      .eq('estado', 'emitida')
      .gte('fecha', dia(-3))
      .lte('fecha', dia(3))
      .gte('monto', parseFloat(monto) - 1)
      .lte('monto', parseFloat(monto) + 1)
    const dup = buscarPosibleDuplicado(
      { fecha, monto: parseFloat(monto), nombre: receptor_nombre ?? null, dni: receptor_dni ?? null },
      emitidas || [],
    )
    if (dup) {
      const [, m, d] = dup.fecha.split('-')
      const cual = dup.numero_cbte ? `la factura nº ${dup.numero_cbte}` : 'una venta marcada como facturada a mano'
      return NextResponse.json({
        error: `Parece ya facturada: ${cual} a ${dup.receptor_nombre || 'Consumidor Final'} del ${d}/${m} por $${Number(dup.monto).toLocaleString('es-AR')}.`,
        posible_duplicado: {
          id: dup.id,
          numero_cbte: dup.numero_cbte,
          receptor_nombre: dup.receptor_nombre,
          fecha: dup.fecha,
          monto: dup.monto,
        },
      }, { status: 409 })
    }
  }

  // Verificar credenciales ARCA configuradas. Va despues de los controles de
  // duplicado, que no necesitan ARCA, y antes de cualquier llamada a ARCA.
  if (!process.env.AFIP_CUIT || !process.env.AFIP_CERT || !process.env.AFIP_KEY) {
    return NextResponse.json(
      { error: 'Faltan variables de entorno ARCA (AFIP_CUIT, AFIP_CERT, AFIP_KEY). Configurá las variables en Vercel.' },
      { status: 503 }
    )
  }

  const cuit = process.env.AFIP_CUIT!.trim()
  const ptoVta = parseInt((process.env.AFIP_PUNTO_VENTA || '1').trim(), 10)
  const tipoCbte = parseInt((process.env.AFIP_TIPO_CBTE || '11').trim(), 10)

  // Determinar tipo/número de documento del receptor
  const docTipo = receptor_dni ? 96 : 99  // 96=DNI, 99=Consumidor Final
  const docNro  = receptor_dni ?? '0'
  // CondicionIVAReceptor (RG 5616 — obligatorio desde 01/04/2026)
  // Sin DNI → Consumidor Final (5). Con DNI → asumimos Consumidor Final (5) por default
  const condIVA = 5

  // Fecha en formato YYYYMMDD para ARCA
  const fechaAFIP = fecha.replace(/-/g, '')

  try {
    // 1-3. Autenticar + obtener último + autorizar. Si AFIP rechaza por TA
    // inválido (cache stale), invalidamos y reintentamos UNA vez con TA fresco.
    const doRequest = async (forceRefresh: boolean): Promise<{ cae: string; caeFch: string; nroCbte: number }> => {
      const { token, sign } = await getAuthTicket(forceRefresh)
      const ultimoNro = await getUltimoComprobante(cuit, token, sign, ptoVta, tipoCbte)
      const nroCbte = ultimoNro + 1
      return autorizarComprobante({
        cuit, token, sign, ptoVta, tipoCbte, nroCbte,
        fecha: fechaAFIP,
        monto: parseFloat(monto),
        docTipo,
        docNro,
        condIVA,
        descripcion,
      })
    }

    let result: { cae: string; caeFch: string; nroCbte: number }
    try {
      result = await doRequest(false)
    } catch (err) {
      if (!isAuthErrorAfip(err)) throw err
      console.warn('[AFIP] Error de auth, invalidando cache TA y reintentando...', err)
      await invalidateAuthCache()
      result = await doRequest(true)
    }
    const { cae, caeFch, nroCbte } = result

    // 4. Guardar factura en Supabase
    const caeFechaISO = caeFch
      ? `${caeFch.slice(0, 4)}-${caeFch.slice(4, 6)}-${caeFch.slice(6, 8)}`
      : null

    const { error: insertErr } = await supabase.from('facturas').insert({
      ...(cita_id       ? { cita_id }       : {}),
      ...(afip_row_key  ? { afip_row_key }  : {}),
      ...(mp_payment_id ? { mp_payment_id } : {}),
      fecha,
      monto: parseFloat(monto),
      descripcion,
      receptor_nombre,
      receptor_dni,
      tipo_cbte: tipoCbte,
      punto_venta: ptoVta,
      numero_cbte: nroCbte,
      cae,
      cae_vencimiento: caeFechaISO,
      estado: 'emitida',
      datos_json: { cuit, ptoVta, tipoCbte, docTipo, docNro, entorno: isProd ? 'produccion' : 'homologacion' },
    })

    if (insertErr) {
      console.error('Error al guardar factura:', insertErr)
      return NextResponse.json({ error: 'Factura generada en ARCA pero no se pudo guardar en la base de datos.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cae, numero_cbte: nroCbte, cae_vencimiento: caeFechaISO })

  } catch (err: any) {
    console.error('Error generando factura ARCA:', err)

    // Guardar el error en la tabla para trazabilidad
    const conflictCol = mp_payment_id ? 'mp_payment_id' : afip_row_key ? 'afip_row_key' : 'cita_id'
    await supabase.from('facturas').upsert({
      ...(cita_id       ? { cita_id }       : {}),
      ...(afip_row_key  ? { afip_row_key }  : {}),
      ...(mp_payment_id ? { mp_payment_id } : {}),
      fecha,
      monto: parseFloat(monto),
      descripcion,
      receptor_nombre,
      receptor_dni,
      tipo_cbte: tipoCbte,
      punto_venta: ptoVta,
      estado: 'error',
      error_msg: err?.message || String(err),
    }, { onConflict: conflictCol })

    return NextResponse.json(
      { error: err?.message || 'Error al comunicarse con ARCA' },
      { status: 502 }
    )
  }
}
