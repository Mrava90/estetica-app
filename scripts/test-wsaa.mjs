/**
 * Test de autenticación WSAA de ARCA con los certificados locales.
 * Ejecutar: node scripts/test-wsaa.mjs
 *
 * Requiere: npm install node-forge (ya está en el proyecto como dep)
 */

import { readFileSync } from 'fs'
import { createRequire } from 'module'
import https from 'https'
import { promisify } from 'util'
import { gunzip as gunzipCb } from 'zlib'

const require = createRequire(import.meta.url)
const forge = require('node-forge')
const gunzip = promisify(gunzipCb)

// ── Configuración ──────────────────────────────────────────────────────────
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const CERT_PATH = join(__dirname, 'arca.crt')
const KEY_PATH  = join(__dirname, 'arca.key')
const CUIT      = '27355365609'
const WSAA_URL  = 'https://wsaa.afip.gov.ar/ws/services/LoginCms'

// ── Helpers ────────────────────────────────────────────────────────────────

function toArgTime(d) {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-03:00'
}

function buildLoginTicketRequest(service) {
  const now  = new Date()
  const from = toArgTime(new Date(now.getTime() - 60_000))
  const to   = toArgTime(new Date(now.getTime() + 43_200_000))
  const uid  = Math.floor(Math.random() * 2_000_000_000)
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uid}</uniqueId>
    <generationTime>${from}</generationTime>
    <expirationTime>${to}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`
}

function buildCmsDer(xml, certPem, keyPem) {
  const cert       = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  console.log('  Certificado subject:', cert.subject.getField('CN')?.value)
  console.log('  Certificado issuer :', cert.issuer.getField('CN')?.value, '/', cert.issuer.getField('O')?.value)
  console.log('  Serial             :', cert.serialNumber)
  console.log('  Válido desde       :', cert.validity.notBefore)
  console.log('  Válido hasta       :', cert.validity.notAfter)

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

const AFIP_AGENT = new https.Agent({ ciphers: 'DEFAULT@SECLEVEL=1' })

function soapPost(url, body, action) {
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
    }, async (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
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

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('=== Test WSAA ARCA ===\n')

const certPem = readFileSync(CERT_PATH, 'utf8')
const keyPem  = readFileSync(KEY_PATH,  'utf8')

console.log('1. Parseando certificado y clave...')
let cmsBase64
try {
  const xml = buildLoginTicketRequest('wsfe')
  cmsBase64 = buildCmsDer(xml, certPem, keyPem)
  console.log('   CMS generado OK (', cmsBase64.length, 'chars base64 )\n')
} catch (e) {
  console.error('   ERROR al generar CMS:', e.message)
  process.exit(1)
}

console.log('2. Llamando a WSAA...')
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

try {
  const responseXml = await soapPost(WSAA_URL, soapBody, 'loginCms')
  const token = extractTag(responseXml, 'token')
  const sign  = extractTag(responseXml, 'sign')
  const fault = extractTag(responseXml, 'faultstring')

  if (token && sign) {
    console.log('   ✓ TOKEN obtenido (primeros 50 chars):', token.slice(0, 50), '...')
    console.log('   ✓ SIGN  obtenido (primeros 50 chars):', sign.slice(0, 50), '...')
    console.log('\n=== ÉXITO: autenticación WSAA funcionando ===')
  } else {
    console.error('   ✗ No se obtuvo token/sign')
    console.error('   Fault:', fault || '(sin faultstring)')
    console.error('\n--- Respuesta completa ---')
    console.error(responseXml.slice(0, 1000))
    process.exit(1)
  }
} catch (e) {
  console.error('   ERROR en llamada SOAP:', e.message)
  process.exit(1)
}
