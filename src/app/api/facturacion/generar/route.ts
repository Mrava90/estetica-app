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
import forge from 'node-forge'
import https from 'https'
import { promisify } from 'util'
import { gunzip as gunzipCb } from 'zlib'

const gunzip = promisify(gunzipCb)

// AFIP usa DH de 1024 bits — OpenSSL 3.x lo rechaza con SECLEVEL=2 (default).
// Bajamos a SECLEVEL=1 para este agente específico.
const AFIP_AGENT = new https.Agent({
  ciphers: 'DEFAULT@SECLEVEL=1',
})

// ── Endpoints ─────────────────────────────────────────────────────────────

const isProd = process.env.AFIP_PROD === 'true'

const WSAA_URL = isProd
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

const WSFE_URL = isProd
  ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

// ── Supabase admin client ─────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── WSAA: Autenticación ──────────────────────────────────────────────────

/**
 * Genera el LoginTicketRequest XML firmado con la clave privada.
 * ARCA usa CMS (PKCS#7) signed data.
 */
function toArgTime(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-03:00'
}

function buildLoginTicketRequest(service: string): string {
  const now = new Date()
  const from = toArgTime(new Date(now.getTime() - 60_000))
  const to   = toArgTime(new Date(now.getTime() + 43_200_000))
  const uniqueId = Math.floor(Math.random() * 2_000_000_000)
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${from}</generationTime>
    <expirationTime>${to}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`
}

/**
 * Genera un CMS (PKCS#7) SignedData DER-encoded en base64.
 * Es el formato que WSAA de ARCA espera en el campo <in0>.
 */
function buildCmsDer(xml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(xml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [],
  })
  p7.sign()

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/**
 * Llama al WSAA para obtener Token y Signature.
 * Devuelve { token, sign } o lanza error.
 */
async function getAuthTicket(): Promise<{ token: string; sign: string }> {
  const cuit = process.env.AFIP_CUIT!
  const cert = process.env.AFIP_CERT!.replace(/\\n/g, '\n')
  const key  = process.env.AFIP_KEY!.replace(/\\n/g, '\n')

  const xml = buildLoginTicketRequest('wsfe')
  const cmsBase64 = buildCmsDer(xml, cert, key)

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov/">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const responseXml = await soapPost(WSAA_URL, soapBody, 'loginCms')
  const token = extractTag(responseXml, 'token')
  const sign  = extractTag(responseXml, 'sign')
  if (!token || !sign) throw new Error('WSAA: no se obtuvo Token/Signature')
  return { token, sign }
}

// ── WSFEV1: Último número de comprobante ─────────────────────────────────

async function getUltimoComprobante(
  cuit: string, token: string, sign: string,
  ptoVta: number, tipoCbte: number
): Promise<number> {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await soapPost(WSFE_URL, soap, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado')
  const nro = parseInt(extractTag(xml, 'CbteNro') || '0', 10)
  return nro
}

// ── WSFEV1: Autorizar comprobante (generar factura) ───────────────────────

interface FacturaParams {
  cuit: string
  token: string
  sign: string
  ptoVta: number
  tipoCbte: number
  nroCbte: number
  fecha: string           // YYYYMMDD
  monto: number           // Total en pesos
  docTipo: number         // 96=DNI, 80=CUIT, 99=Consumidor Final
  docNro: string          // 0 para Consumidor Final
  descripcion: string
}

async function autorizarComprobante(p: FacturaParams): Promise<{ cae: string; caeFch: string; nroCbte: number }> {
  const montoStr = p.monto.toFixed(2)

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${p.token}</ar:Token>
        <ar:Sign>${p.sign}</ar:Sign>
        <ar:Cuit>${p.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${p.ptoVta}</ar:PtoVta>
          <ar:CbteTipo>${p.tipoCbte}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>2</ar:Concepto>
            <ar:DocTipo>${p.docTipo}</ar:DocTipo>
            <ar:DocNro>${p.docNro}</ar:DocNro>
            <ar:CbteDesde>${p.nroCbte}</ar:CbteDesde>
            <ar:CbteHasta>${p.nroCbte}</ar:CbteHasta>
            <ar:CbteFch>${p.fecha}</ar:CbteFch>
            <ar:ImpTotal>${montoStr}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${montoStr}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>0.00</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:FchServDesde>${p.fecha}</ar:FchServDesde>
            <ar:FchServHasta>${p.fecha}</ar:FchServHasta>
            <ar:FchVtoPago>${p.fecha}</ar:FchVtoPago>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await soapPost(WSFE_URL, soap, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar')
  console.log('[ARCA FECAESolicitar] respuesta cruda:', xml.slice(0, 2000))
  const cae = extractTag(xml, 'CAE')
  const caeFch = extractTag(xml, 'CAEFchVto')
  if (!cae) {
    const msgs = extractAllTags(xml, 'Msg')
    const fault = extractTag(xml, 'faultstring')
    const obs = msgs.join(' | ') || fault || extractTag(xml, 'Err') || xml.slice(0, 500)
    throw new Error(`ARCA rechazó: ${obs}`)
  }
  return { cae, caeFch: caeFch || '', nroCbte: p.nroCbte }
}

// ── HTTP/SOAP helpers ─────────────────────────────────────────────────────

function soapPost(url: string, body: string, action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf-8')
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      agent: AFIP_AGENT,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': buf.byteLength,
        'SOAPAction': action,
      },
    }
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', async () => {
        const raw = Buffer.concat(chunks)
        const enc = res.headers['content-encoding']
        const text = enc === 'gzip'
          ? (await gunzip(raw)).toString('utf-8')
          : raw.toString('utf-8')
        resolve(text)
      })
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}

function extractTag(xml: string, tag: string): string {
  const decoded = decodeEntities(xml)
  const m = decoded.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

function extractAllTags(xml: string, tag: string): string[] {
  const decoded = decodeEntities(xml)
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi')
  const results: string[] = []
  let m
  while ((m = re.exec(decoded)) !== null) results.push(m[1].trim())
  return results
}

// ── Endpoint principal ───────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar credenciales ARCA configuradas
  if (!process.env.AFIP_CUIT || !process.env.AFIP_CERT || !process.env.AFIP_KEY) {
    return NextResponse.json(
      { error: 'Faltan variables de entorno ARCA (AFIP_CUIT, AFIP_CERT, AFIP_KEY). Configurá las variables en Vercel.' },
      { status: 503 }
    )
  }

  const body = await request.json()
  const { cita_id, afip_row_key, receptor_nombre, receptor_dni, monto, fecha, descripcion } = body

  if ((!cita_id && !afip_row_key) || !monto || !fecha) {
    return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Verificar que no tenga ya una factura emitida
  const query = supabase.from('facturas').select('id, estado').eq('estado', 'emitida')
  if (afip_row_key) query.eq('afip_row_key', afip_row_key)
  else              query.eq('cita_id', cita_id)
  const { data: existing } = await query.maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Ya existe una factura emitida para este ítem.' }, { status: 409 })
  }

  const cuit = process.env.AFIP_CUIT!
  const ptoVta = parseInt(process.env.AFIP_PUNTO_VENTA || '1', 10)
  const tipoCbte = parseInt(process.env.AFIP_TIPO_CBTE || '11', 10)

  // Determinar tipo/número de documento del receptor
  const docTipo = receptor_dni ? 96 : 99  // 96=DNI, 99=Consumidor Final
  const docNro  = receptor_dni ?? '0'

  // Fecha en formato YYYYMMDD para ARCA
  const fechaAFIP = fecha.replace(/-/g, '')

  try {
    // 1. Autenticar con WSAA
    const { token, sign } = await getAuthTicket()

    // 2. Obtener último número de comprobante
    const ultimoNro = await getUltimoComprobante(cuit, token, sign, ptoVta, tipoCbte)
    const nroCbte = ultimoNro + 1

    // 3. Solicitar autorización (CAE) al WSFEV1
    const { cae, caeFch } = await autorizarComprobante({
      cuit, token, sign, ptoVta, tipoCbte, nroCbte,
      fecha: fechaAFIP,
      monto: parseFloat(monto),
      docTipo,
      docNro,
      descripcion,
    })

    // 4. Guardar factura en Supabase
    const caeFechaISO = caeFch
      ? `${caeFch.slice(0, 4)}-${caeFch.slice(4, 6)}-${caeFch.slice(6, 8)}`
      : null

    const { error: insertErr } = await supabase.from('facturas').insert({
      ...(cita_id     ? { cita_id }     : {}),
      ...(afip_row_key ? { afip_row_key } : {}),
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
    const conflictCol = afip_row_key ? 'afip_row_key' : 'cita_id'
    await supabase.from('facturas').upsert({
      ...(cita_id      ? { cita_id }      : {}),
      ...(afip_row_key ? { afip_row_key } : {}),
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
