/**
 * Rate limiter en memoria basado en sliding window por clave (tipicamente IP).
 *
 * Ventajas: cero dependencias, cero latencia, cero config.
 * Limitaciones:
 *   - Cada proceso Vercel tiene su propio Map (no comparten entre lambdas).
 *   - Se resetea en cold start.
 * Para el volumen de esta app es suficiente para bloquear abuso individual.
 * Si en el futuro el trafico crece, migrar a Upstash Redis.
 */

type Bucket = {
  timestamps: number[]  // timestamps (ms) de las requests dentro de la ventana
  blockedUntil?: number  // si esta bloqueado, ms hasta cuando
}

const buckets = new Map<string, Bucket>()

// Limpieza periodica para no crecer indefinidamente (cleanup lazy en cada check)
let lastCleanup = 0
const CLEANUP_INTERVAL_MS = 60_000

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  // Limite arbitrario: si algun bucket no tuvo actividad en 10 min, se descarta
  const staleThreshold = now - 10 * 60_000
  for (const [key, bucket] of buckets.entries()) {
    const lastActivity = bucket.timestamps.length > 0
      ? bucket.timestamps[bucket.timestamps.length - 1]
      : 0
    if (lastActivity < staleThreshold && (!bucket.blockedUntil || bucket.blockedUntil < now)) {
      buckets.delete(key)
    }
  }
}

export interface RateLimitOptions {
  /** Nombre del limite (para distinguir buckets entre features distintas) */
  name: string
  /** Ventana de tiempo en ms */
  windowMs: number
  /** Maximo de requests permitidas dentro de la ventana */
  max: number
  /** Si se supera, cuanto tiempo bloquear despues (ms). Opcional; default = windowMs */
  blockMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number  // timestamp ms cuando el bucket libera espacio
  retryAfterSec?: number  // solo si allowed=false
}

/**
 * Chequea y consume una request para la clave dada.
 * Uso: const r = check(ip, {name:'booking-post', windowMs:60_000, max:5})
 *      if (!r.allowed) return 429
 */
export function check(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  cleanup(now)

  const bucketKey = `${opts.name}:${key}`
  let bucket = buckets.get(bucketKey)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(bucketKey, bucket)
  }

  // Si estaba bloqueado y el bloqueo sigue vigente, rechazar
  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.blockedUntil,
      retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000),
    }
  }

  // Purgar timestamps fuera de la ventana
  const windowStart = now - opts.windowMs
  bucket.timestamps = bucket.timestamps.filter(t => t > windowStart)

  if (bucket.timestamps.length >= opts.max) {
    const blockMs = opts.blockMs ?? opts.windowMs
    bucket.blockedUntil = now + blockMs
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.blockedUntil,
      retryAfterSec: Math.ceil(blockMs / 1000),
    }
  }

  bucket.timestamps.push(now)
  bucket.blockedUntil = undefined
  const oldest = bucket.timestamps[0] ?? now
  return {
    allowed: true,
    remaining: Math.max(0, opts.max - bucket.timestamps.length),
    resetAt: oldest + opts.windowMs,
  }
}

/**
 * Extrae la IP del cliente desde headers estandar (X-Forwarded-For, etc).
 * En Vercel: x-forwarded-for es confiable (Vercel lo setea).
 */
export function getClientIp(req: Request): string {
  const h = req.headers
  const xff = h.get('x-forwarded-for')
  if (xff) {
    // Formato "clientIp, proxy1, proxy2" — el 1er valor es la IP del cliente
    return xff.split(',')[0].trim()
  }
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown'
}
