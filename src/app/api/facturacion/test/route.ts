/**
 * GET /api/facturacion/test
 *
 * Verifica que las credenciales ARCA estén configuradas y que la conexión
 * al WSAA funcione correctamente. Útil para diagnosticar problemas de setup.
 *
 * Solo accesible para usuarios autenticados.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import forge from 'node-forge'
import https from 'https'
import { promisify } from 'util'
import { gunzip as gunzipCb } from 'zlib'

const gunzip = promisify(gunzipCb)

const AFIP_AGENT = new https.Agent({ ciphers: 'DEFAULT@SECLEVEL=1' })

const isProd = process.env.AFIP_PROD === 'true'
const WSAA_URL = isProd
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

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
        'SOAPAction': action,
      },
    }, (res) => {
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

export async function GET() {
  // Solo para usuarios autenticados
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const checks: Record<string, { ok: boolean; detail: string }> = {}

  // 1. Verificar variables de entorno
  const requiredVars = ['AFIP_CUIT', 'AFIP_CERT', 'AFIP_KEY', 'AFIP_PUNTO_VENTA', 'AFIP_TIPO_CBTE']
  const missingVars = requiredVars.filter(v => !process.env[v])
  checks.env_vars = {
    ok: missingVars.length === 0,
    detail: missingVars.length === 0
      ? `Todas las variables configuradas. Entorno: ${isProd ? 'PRODUCCIÓN' : 'homologación'}`
      : `Faltan: ${missingVars.join(', ')}`,
  }

  if (missingVars.length > 0) {
    return NextResponse.json({ ok: false, checks })
  }

  const certPem = process.env.AFIP_CERT!.replace(/\\n/g, '\n')
  const keyPem  = process.env.AFIP_KEY!.replace(/\\n/g, '\n')

  // 2. Verificar formato del certificado
  try {
    const cert = forge.pki.certificateFromPem(certPem)
    const expiry = cert.validity.notAfter
    const daysLeft = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    checks.cert_format = {
      ok: daysLeft > 0,
      detail: daysLeft > 0
        ? `Certificado válido hasta ${expiry.toLocaleDateString('es-AR')} (${daysLeft} días)`
        : `Certificado VENCIDO el ${expiry.toLocaleDateString('es-AR')}`,
    }
  } catch (e: unknown) {
    checks.cert_format = { ok: false, detail: `Certificado inválido: ${e instanceof Error ? e.message : String(e)}` }
    return NextResponse.json({ ok: false, checks })
  }

  // 3. Verificar formato de la clave privada
  try {
    forge.pki.privateKeyFromPem(keyPem)
    checks.key_format = { ok: true, detail: 'Clave privada válida' }
  } catch (e: unknown) {
    checks.key_format = { ok: false, detail: `Clave privada inválida: ${e instanceof Error ? e.message : String(e)}` }
    return NextResponse.json({ ok: false, checks })
  }

  // 4. Intentar conectar al WSAA
  try {
    const xml = buildLoginTicketRequest('wsfe')
    const cmsBase64 = buildCmsDer(xml, certPem, keyPem)

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

    const response = await soapPost(WSAA_URL, soapBody, 'loginCms')
    const token = extractTag(response, 'token')
    const sign  = extractTag(response, 'sign')

    if (token && sign) {
      checks.wsaa_connection = {
        ok: true,
        detail: `Autenticación exitosa en ${isProd ? 'producción' : 'homologación'}. Token obtenido.`,
      }
    } else {
      const errMsg = extractTag(response, 'faultstring') || extractTag(response, 'Msg') || 'Sin token en respuesta'
      checks.wsaa_connection = { ok: false, detail: `WSAA respondió pero sin token: ${errMsg}` }
    }
  } catch (e: unknown) {
    checks.wsaa_connection = {
      ok: false,
      detail: `Error conectando al WSAA: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json({ ok: allOk, checks, entorno: isProd ? 'produccion' : 'homologacion' })
}
