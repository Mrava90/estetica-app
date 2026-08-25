import { createAdminClient } from './supabase/admin'

/**
 * Claves que NUNCA deben terminar en cron_logs (secretos, tokens, certificados).
 * Cualquier key que matchee este patrón es reemplazada por '[REDACTED]'.
 */
const SENSITIVE_KEY_RE = /(token|sign|secret|password|api[_-]?key|cert|private[_-]?key|cuit|access[_-]?token)/i

function sanitizeDetails(obj: unknown, depth = 0): unknown {
  if (depth > 3 || obj == null) return obj
  if (typeof obj !== 'object') {
    // Si es string largo (>500 chars) probablemente sea XML/HTML/data — truncar
    if (typeof obj === 'string' && obj.length > 500) return obj.slice(0, 500) + '...[truncated]'
    return obj
  }
  if (Array.isArray(obj)) return obj.slice(0, 50).map((v) => sanitizeDetails(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) out[k] = '[REDACTED]'
    else out[k] = sanitizeDetails(v, depth + 1)
  }
  return out
}

/**
 * Envuelve una función de cron logging su inicio/fin/error en la tabla cron_logs.
 * Si el cron tira excepción, queda registrado como 'error' con el mensaje.
 */
export async function withCronLog<T>(
  cronName: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>
): Promise<T> {
  const admin = createAdminClient()
  const startedAt = Date.now()

  const safeDetails = details ? sanitizeDetails(details) : null

  const { data: log } = await admin
    .from('cron_logs')
    .insert({ cron_name: cronName, status: 'running', details: safeDetails })
    .select('id')
    .single()

  const logId = log?.id

  try {
    const result = await fn()
    if (logId) {
      const safeResult = typeof result === 'object' ? sanitizeDetails(result) : { value: result }
      await admin.from('cron_logs').update({
        status: 'success',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        details: { ...(safeDetails as object || {}), result: safeResult },
      }).eq('id', logId)
    }
    return result
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (logId) {
      await admin.from('cron_logs').update({
        status: 'error',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_msg: errorMsg.slice(0, 1000),
      }).eq('id', logId)
    }
    throw err
  }
}
