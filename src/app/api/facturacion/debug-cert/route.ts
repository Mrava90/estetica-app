/**
 * GET /api/facturacion/debug-cert
 * Muestra info del certificado AFIP decodificado — SOLO para debugging.
 *
 * Requiere DOS condiciones para responder:
 *   1. Usuario admin (isAdminEmail)
 *   2. AFIP_DEBUG_ENABLED=true en env vars (defensa en profundidad)
 *
 * Cuando termines de debuggear:
 *   - Sacá AFIP_DEBUG_ENABLED de Vercel env vars
 *   - Idealmente, borrá esta ruta
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/constants'
import forge from 'node-forge'

function decodePemEnv(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('-----')) {
    return trimmed.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  }
  return Buffer.from(trimmed, 'base64').toString('utf8')
}

export async function GET() {
  // Doble barrera: solo admin + solo si el flag esta explicitamente habilitado
  if (process.env.AFIP_DEBUG_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  }

  const rawCert = process.env.AFIP_CERT
  const rawKey  = process.env.AFIP_KEY

  if (!rawCert || !rawKey) {
    return NextResponse.json({ error: 'AFIP_CERT o AFIP_KEY no configuradas' })
  }

  try {
    const certPem = decodePemEnv(rawCert)
    const cert = forge.pki.certificateFromPem(certPem)

    // Verificar que la clave corresponde al cert
    let keyOk = false
    let keyError = ''
    try {
      const keyPem = decodePemEnv(rawKey)
      const privateKey = forge.pki.privateKeyFromPem(keyPem)
      // Verificar que la clave privada corresponde al certificado público
      const pubFromCert = cert.publicKey as forge.pki.rsa.PublicKey
      const privKey = privateKey as forge.pki.rsa.PrivateKey
      keyOk = pubFromCert.n.equals(privKey.n)
    } catch (e: any) {
      keyError = e.message
    }

    return NextResponse.json({
      cert: {
        subject: cert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
        issuer: cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
        serial: cert.serialNumber,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        pemStart: certPem.slice(0, 80),  // primeros 80 chars para verificar formato
        pemLength: certPem.length,
      },
      keyMatchesCert: keyOk,
      keyError: keyError || undefined,
      rawCertLength: rawCert.length,
      rawCertStart: rawCert.slice(0, 30),  // ver si es base64 o PEM directo
    })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Error parseando certificado: ' + e.message,
      rawCertLength: rawCert.length,
      rawCertStart: rawCert.slice(0, 50),
    }, { status: 500 })
  }
}
