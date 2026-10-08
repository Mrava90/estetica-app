/**
 * Enlace de acceso a /reservar/mis-turnos que va en el mail de confirmacion.
 *
 * ── Por que no el magic link de Supabase ──────────────────────────────────
 * El magic link vence a la hora (mailer_otp_exp = 3600) y sirve una sola vez.
 * El mail prometia 7 dias: la clienta que lo abria despues, o cuyo correo
 * "revisaba" el enlace antes de entregarlo (Outlook/Hotmail lo hacen), caia
 * en /login del personal y terminaba pidiendo "olvide mi contraseña" de una
 * cuenta que nunca tuvo clave.
 *
 * Ahora el mail lleva un enlace propio firmado (HMAC) que vale 7 dias y se
 * puede abrir las veces que haga falta. /auth/acceso lo verifica y RECIEN
 * AHI pide a Supabase un magic link nuevo y lo canjea en el mismo momento.
 *
 * La clave HMAC se deriva de SUPABASE_SERVICE_ROLE_KEY con un contexto fijo,
 * para no tener que agregar otra variable de entorno. Si se rota esa key, los
 * enlaces ya enviados dejan de valer (y la clienta pide uno nuevo).
 */

import { createHmac, timingSafeEqual } from 'crypto'

const DIAS_VALIDEZ = 7

function clave(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createHmac('sha256', base).update('kawirth:acceso-mis-turnos:v1').digest()
}

function firmar(payload: string): string {
  return createHmac('sha256', clave()).update(payload).digest('base64url')
}

/** Token `payload.firma` para el email dado, valido DIAS_VALIDEZ dias. */
export function firmarAcceso(email: string, dias = DIAS_VALIDEZ): string {
  const payload = Buffer.from(JSON.stringify({
    e: email.trim().toLowerCase(),
    x: Date.now() + dias * 86_400_000,
  })).toString('base64url')
  return `${payload}.${firmar(payload)}`
}

/** Devuelve el email si el token es valido y no vencio; si no, null. */
export function verificarAcceso(token: string | null | undefined): string | null {
  if (!token) return null
  const [payload, firma] = token.split('.')
  if (!payload || !firma) return null
  const esperada = Buffer.from(firmar(payload))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof e !== 'string' || typeof x !== 'number' || Date.now() > x) return null
    return e
  } catch {
    return null
  }
}
