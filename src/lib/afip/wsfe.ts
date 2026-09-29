/**
 * Cliente de ARCA (ex-AFIP): autenticacion WSAA y factura electronica WSFEV1.
 *
 * Lo usan la emision (/api/facturacion/generar) y la conciliacion contra ARCA
 * (/api/facturacion/conciliar-arca). El codigo de autenticacion y emision es
 * el mismo que vivia en la ruta generar, movido sin cambios.
 *
 * Variables de entorno: AFIP_CUIT, AFIP_CERT, AFIP_KEY, AFIP_PUNTO_VENTA,
 * AFIP_TIPO_CBTE, AFIP_PROD. Ver el encabezado de la ruta generar.
 */

import { createClient } from '@supabase/supabase-js'
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

export const isProd = process.env.AFIP_PROD?.trim() === 'true'

const WSAA_URL = isProd
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

const WSFE_URL = isProd
  ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'


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
/**
 * Decodifica un PEM almacenado como base64 en la variable de entorno.
 * Soporta también el formato antiguo con \n literales como fallback.
 */
function decodePemEnv(raw: string): string {
  const trimmed = raw.trim()
  // Si empieza con "-----BEGIN" ya es un PEM directo (con \n literales o reales)
  if (trimmed.startsWith('-----')) {
    return trimmed.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  }
  // Si no, asumir que es base64 del PEM completo
  return Buffer.from(trimmed, 'base64').toString('utf8')
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const SERVICE_WSFE = 'wsfe'

/**
 * Detecta si un error de AFIP es de autenticación (token vencido, inválido, etc).
 * Si lo es, conviene invalidar el cache del TA y regenerar.
 */
export function isAuthErrorAfip(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('token') && (msg.includes('inv') || msg.includes('vencid') || msg.includes('expir')) ||
    msg.includes('no autorizado') ||
    msg.includes('no autenticado') ||
    msg.includes('autenticación') ||
    msg.includes('sign inválido') ||
    msg.includes('cms.bad') ||
    /\b(600|601|602|1005|1101)\b/.test(msg) // códigos típicos de auth AFIP
  )
}

/**
 * Invalida el TA cacheado de forma segura.
 */
export async function invalidateAuthCache(service = SERVICE_WSFE) {
  const admin = getAdminClient()
  await admin.from('afip_ta_cache').delete().eq('service', service)
}

export async function getAuthTicket(forceRefresh = false): Promise<{ token: string; sign: string }> {
  const admin = getAdminClient()

  // 1. Intentar cachear: si existe un TA válido (margen 5 min de seguridad), reutilizarlo
  if (!forceRefresh) {
    const { data: cached } = await admin
      .from('afip_ta_cache')
      .select('token, sign, expires_at')
      .eq('service', SERVICE_WSFE)
      .single()

    if (cached) {
      const expiresAt = new Date(cached.expires_at).getTime()
      const now = Date.now()
      const margin = 5 * 60 * 1000 // 5 min de seguridad
      if (expiresAt - margin > now) {
        return { token: cached.token, sign: cached.sign }
      }
    }
  }

  // 2. Pedir un TA nuevo
  const cert = decodePemEnv(process.env.AFIP_CERT!)
  const key  = decodePemEnv(process.env.AFIP_KEY!)

  const xml = buildLoginTicketRequest(SERVICE_WSFE)
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

  if (!token || !sign) {
    const fault = extractTag(responseXml, 'faultstring') || extractTag(responseXml, 'faultcode')
    const detail = fault || responseXml.slice(0, 400)

    // Si AFIP rechaza por "TA válido existente" pero no lo tenemos en cache,
    // significa que otra request paralela acaba de cachearlo: reintentar lectura
    if (detail.includes('CEE ya posee un TA valido') || detail.includes('TA valido')) {
      const { data: retry } = await admin
        .from('afip_ta_cache')
        .select('token, sign, expires_at')
        .eq('service', SERVICE_WSFE)
        .single()
      if (retry) {
        const expiresAt = new Date(retry.expires_at).getTime()
        if (expiresAt > Date.now()) {
          return { token: retry.token, sign: retry.sign }
        }
      }
    }

    throw new Error(`WSAA: no se obtuvo Token/Signature — ${detail}`)
  }

  // 3. Guardar en cache (TA dura 12h, lo decimos explícito por si AFIP no lo informa)
  const expirationXml = extractTag(responseXml, 'expirationTime')
  const expiresAt = expirationXml
    ? new Date(expirationXml).toISOString()
    : new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString() // 11h por las dudas

  await admin
    .from('afip_ta_cache')
    .upsert({ service: SERVICE_WSFE, token, sign, expires_at: expiresAt, updated_at: new Date().toISOString() })

  return { token, sign }
}

// ── WSFEV1: Último número de comprobante ─────────────────────────────────

export async function getUltimoComprobante(
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

export interface FacturaParams {
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
  condIVA: number         // 5=Consumidor Final, 6=Monotributista, 1=Resp Inscripto (RG 5616, oblig. 01/04/2026)
  descripcion: string
}

function hoyARCA(): string {
  // Fecha de hoy en zona horaria Argentina (UTC-3), formato YYYYMMDD
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

export async function autorizarComprobante(p: FacturaParams): Promise<{ cae: string; caeFch: string; nroCbte: number }> {
  const montoStr = p.monto.toFixed(2)
  const fechaEmision = hoyARCA()  // CbteFch = hoy (req. ARCA: dentro de ±10 días)

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
            <ar:CbteFch>${fechaEmision}</ar:CbteFch>
            <ar:ImpTotal>${montoStr}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${montoStr}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>0.00</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:FchServDesde>${p.fecha}</ar:FchServDesde>
            <ar:FchServHasta>${p.fecha}</ar:FchServHasta>
            <ar:FchVtoPago>${fechaEmision}</ar:FchVtoPago>
            <ar:CondicionIVAReceptorId>${p.condIVA}</ar:CondicionIVAReceptorId>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await soapPost(WSFE_URL, soap, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar')
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

export function soapPost(url: string, body: string, action: string): Promise<string> {
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

export function extractTag(xml: string, tag: string): string {
  const decoded = decodeEntities(xml)
  const m = decoded.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

export function extractAllTags(xml: string, tag: string): string[] {
  const decoded = decodeEntities(xml)
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi')
  const results: string[] = []
  let m
  while ((m = re.exec(decoded)) !== null) results.push(m[1].trim())
  return results
}

// ── WSFEV1: Consultar un comprobante ya emitido (solo lectura) ────────────

export interface ComprobanteARCA {
  nro: number
  fechaEmision: string   // YYYY-MM-DD (CbteFch)
  monto: number          // ImpTotal
  docTipo: number        // 96=DNI, 80=CUIT, 99=Consumidor Final
  docNro: string         // '0' si es Consumidor Final
  cae: string
  resultado: string      // 'A' aprobado, 'R' rechazado
}

/**
 * Trae un comprobante de ARCA por numero. No emite ni modifica nada.
 * Devuelve null si ARCA no tiene ese numero (codigo 602).
 */
export async function consultarComprobante(
  cuit: string, token: string, sign: string,
  ptoVta: number, tipoCbte: number, nro: number
): Promise<ComprobanteARCA | null> {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompConsultar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCompConsReq>
        <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
        <ar:CbteNro>${nro}</ar:CbteNro>
        <ar:PtoVta>${ptoVta}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await soapPost(WSFE_URL, soap, 'http://ar.gov.afip.dif.FEV1/FECompConsultar')
  const fch = extractTag(xml, 'CbteFch')
  if (!fch) {
    const codigo = extractTag(xml, 'Code')
    if (codigo === '602') return null
    const msg = extractAllTags(xml, 'Msg').join(' | ') || extractTag(xml, 'faultstring') || xml.slice(0, 300)
    throw new Error(`ARCA (consulta nº ${nro}): ${codigo ? codigo + ' ' : ''}${msg}`)
  }
  return {
    nro,
    fechaEmision: `${fch.slice(0, 4)}-${fch.slice(4, 6)}-${fch.slice(6, 8)}`,
    monto: parseFloat(extractTag(xml, 'ImpTotal') || '0'),
    docTipo: parseInt(extractTag(xml, 'DocTipo') || '0', 10),
    docNro: extractTag(xml, 'DocNro') || '0',
    cae: extractTag(xml, 'CodAutorizacion'),
    resultado: extractTag(xml, 'Resultado'),
  }
}
