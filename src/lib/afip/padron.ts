/**
 * Cliente AFIP WS_SR_PADRON_A13 — consulta de datos del padrón.
 * Endpoint: getPersona(token, sign, cuitRepresentada, idPersona)
 *
 * Requisitos:
 *  1. Tener AFIP_CERT/AFIP_KEY/AFIP_CUIT configurados (mismas que facturación)
 *  2. Habilitar el servicio "ws_sr_padron_a13" en el portal AFIP:
 *     Administrador de Relaciones de Clave Fiscal → Adherir servicio →
 *     buscar "ws_sr_padron_a13" → vincular al certificado digital existente.
 */

import forge from 'node-forge'
import https from 'https'
import { promisify } from 'util'
import { gunzip as gunzipCb } from 'zlib'
import { createClient } from '@supabase/supabase-js'

const gunzip = promisify(gunzipCb)

const AFIP_AGENT = new https.Agent({ ciphers: 'DEFAULT@SECLEVEL=1' })

const isProd = process.env.AFIP_PROD?.trim() === 'true'

const WSAA_URL = isProd
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

const PADRON_URL = isProd
  ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
  : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13'

const SERVICE = 'ws_sr_padron_a13'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function decodePemEnv(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('-----')) return trimmed.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  return Buffer.from(trimmed, 'base64').toString('utf8')
}

function toArgTime(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-03:00'
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

function extractTag(xml: string, tag: string): string {
  const decoded = decodeEntities(xml)
  const m = decoded.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

function extractAllTags(xml: string, tag: string): string[] {
  const decoded = decodeEntities(xml)
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi')
  const out: string[] = []
  let m
  while ((m = re.exec(decoded)) !== null) out.push(m[1].trim())
  return out
}

function soapPost(url: string, body: string, action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf-8')
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      agent: AFIP_AGENT,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': buf.byteLength,
        SOAPAction: action,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', async () => {
        const raw = Buffer.concat(chunks)
        const enc = res.headers['content-encoding']
        const text = enc === 'gzip' ? (await gunzip(raw)).toString('utf-8') : raw.toString('utf-8')
        resolve(text)
      })
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function buildLoginTicketRequest(service: string): string {
  const now = new Date()
  const from = toArgTime(new Date(now.getTime() - 60_000))
  const to = toArgTime(new Date(now.getTime() + 43_200_000))
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

function buildCmsDer(xml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(xml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({ key: privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [] })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

async function getAuthTicket(): Promise<{ token: string; sign: string }> {
  const admin = getAdminClient()

  // Cache hit
  const { data: cached } = await admin
    .from('afip_ta_cache')
    .select('token, sign, expires_at')
    .eq('service', SERVICE)
    .single()
  if (cached) {
    const expiresAt = new Date(cached.expires_at).getTime()
    if (expiresAt - 5 * 60 * 1000 > Date.now()) {
      return { token: cached.token, sign: cached.sign }
    }
  }

  const cert = decodePemEnv(process.env.AFIP_CERT!)
  const key = decodePemEnv(process.env.AFIP_KEY!)
  const xml = buildLoginTicketRequest(SERVICE)
  const cmsBase64 = buildCmsDer(xml, cert, key)

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov/">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const responseXml = await soapPost(WSAA_URL, soapBody, 'loginCms')
  const token = extractTag(responseXml, 'token')
  const sign = extractTag(responseXml, 'sign')

  if (!token || !sign) {
    const fault = extractTag(responseXml, 'faultstring') || extractTag(responseXml, 'faultcode')
    if (fault.includes('CEE ya posee un TA') || fault.includes('TA valido')) {
      // Otra request paralela cacheó: reintentar lectura
      const { data: retry } = await admin
        .from('afip_ta_cache').select('token, sign, expires_at')
        .eq('service', SERVICE).single()
      if (retry && new Date(retry.expires_at).getTime() > Date.now()) {
        return { token: retry.token, sign: retry.sign }
      }
    }
    throw new Error(`WSAA (padrón): ${fault || responseXml.slice(0, 400)}`)
  }

  const expirationXml = extractTag(responseXml, 'expirationTime')
  const expiresAt = expirationXml
    ? new Date(expirationXml).toISOString()
    : new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString()

  await admin.from('afip_ta_cache').upsert({
    service: SERVICE, token, sign, expires_at: expiresAt, updated_at: new Date().toISOString(),
  })

  return { token, sign }
}

// ── Parsing del response de getPersona ──────────────────────────────────────

export interface PadronData {
  cuit: string
  estadoClave: string
  tipoPersona: string
  razonSocial: string | null
  nombre: string | null
  apellido: string | null
  categoriaMonotributo: string | null
  categoriaId: number | null
  impuestos: Array<{ id: number; descripcion: string; estado: string; periodo: string | null }>
  actividades: Array<{ id: string; descripcion: string; tipo: string | null }>
  domicilios: Array<{ direccion: string; localidad: string; provincia: string; codPostal: string; tipo: string }>
  rawXml: string
}

function parsePadronResponse(xml: string): PadronData {
  const decoded = decodeEntities(xml)

  // Bloque principal
  const cuit = extractTag(decoded, 'idPersona')
  const estadoClave = extractTag(decoded, 'estadoClave')
  const tipoPersona = extractTag(decoded, 'tipoPersona')
  const razonSocial = extractTag(decoded, 'razonSocial') || null
  const nombre = extractTag(decoded, 'nombre') || null
  const apellido = extractTag(decoded, 'apellido') || null

  // Categoría monotributo: viene dentro de <datosMonotributo><categoriaMonotributo>
  // o como <categoria> con idCategoria. Buscamos ambas.
  let categoriaMonotributo: string | null = null
  let categoriaId: number | null = null
  const catBlock = decoded.match(/<categoriaMonotributo[^>]*>([\s\S]*?)<\/categoriaMonotributo>/i)
  if (catBlock) {
    const desc = extractTag(catBlock[1], 'descripcionCategoria') || extractTag(catBlock[1], 'idCategoria')
    if (desc) categoriaMonotributo = desc
    const idCat = extractTag(catBlock[1], 'idCategoria')
    if (idCat) categoriaId = parseInt(idCat, 10)
  } else {
    // Fallback: buscar dentro de impuestos con idImpuesto=20 (Monotributo)
    const monoBlock = decoded.match(/<impuesto[^>]*>[\s\S]*?<idImpuesto>20<\/idImpuesto>[\s\S]*?<\/impuesto>/i)
    if (monoBlock) {
      const desc = extractTag(monoBlock[0], 'descripcionCategoria') || extractTag(monoBlock[0], 'descripcionImpuesto')
      if (desc) categoriaMonotributo = desc
    }
  }

  // Impuestos
  const impuestos: PadronData['impuestos'] = []
  const impMatches = decoded.matchAll(/<impuesto>([\s\S]*?)<\/impuesto>/gi)
  for (const m of impMatches) {
    const id = parseInt(extractTag(m[1], 'idImpuesto'), 10)
    const descripcion = extractTag(m[1], 'descripcionImpuesto') || ''
    const estado = extractTag(m[1], 'estado') || ''
    const periodo = extractTag(m[1], 'periodo') || null
    if (!isNaN(id)) impuestos.push({ id, descripcion, estado, periodo })
  }

  // Actividades
  const actividades: PadronData['actividades'] = []
  const actMatches = decoded.matchAll(/<actividad>([\s\S]*?)<\/actividad>/gi)
  for (const m of actMatches) {
    const id = extractTag(m[1], 'idActividad')
    if (id) {
      actividades.push({
        id,
        descripcion: extractTag(m[1], 'descripcionActividad') || '',
        tipo: extractTag(m[1], 'orden') || null,
      })
    }
  }

  // Domicilios
  const domicilios: PadronData['domicilios'] = []
  const domMatches = decoded.matchAll(/<domicilio>([\s\S]*?)<\/domicilio>/gi)
  for (const m of domMatches) {
    domicilios.push({
      direccion: extractTag(m[1], 'direccion') || '',
      localidad: extractTag(m[1], 'localidad') || '',
      provincia: extractTag(m[1], 'descripcionProvincia') || extractTag(m[1], 'idProvincia') || '',
      codPostal: extractTag(m[1], 'codPostal') || '',
      tipo: extractTag(m[1], 'tipoDomicilio') || '',
    })
  }

  return {
    cuit,
    estadoClave,
    tipoPersona,
    razonSocial,
    nombre,
    apellido,
    categoriaMonotributo,
    categoriaId,
    impuestos,
    actividades,
    domicilios,
    rawXml: xml,
  }
}

/**
 * Consulta el padrón AFIP para el CUIT dado.
 * Si no se pasa, consulta el propio CUIT del contribuyente (AFIP_CUIT).
 */
export async function consultarPadron(cuitConsulta?: string): Promise<PadronData> {
  const cuitRep = process.env.AFIP_CUIT!.trim()
  const cuitTarget = (cuitConsulta || cuitRep).trim()

  const { token, sign } = await getAuthTicket()

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cuitRep}</cuitRepresentada>
      <idPersona>${cuitTarget}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await soapPost(PADRON_URL, soap, '')

  // Verificar fault
  const fault = extractTag(xml, 'faultstring')
  if (fault) throw new Error(`Padrón AFIP: ${fault}`)

  const errMsgs = extractAllTags(xml, 'errorMessage')
  if (errMsgs.length > 0) throw new Error(`Padrón AFIP: ${errMsgs.join(' | ')}`)

  return parsePadronResponse(xml)
}
