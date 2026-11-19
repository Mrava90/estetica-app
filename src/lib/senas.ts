/**
 * Señas de diciembre 2026: turnos (web o cargados a mano) que todavia no tienen
 * la seña definida. Aparecen en Reenganche → Señas para que Fabi le escriba
 * a la clienta. sena_monto = 0 con sena_medio 'no_cobra' = no se le cobra
 * (clienta habitual): sale de la lista.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const SENA_MONTO = 15000
export const SENA_ALIAS = 'ka.ballester'
// Diciembre 2026 en hora AR (UTC-3)
export const SENA_DESDE = '2026-12-01T03:00:00Z'
export const SENA_HASTA = '2027-01-01T03:00:00Z'

export interface SenaPendiente {
  id: string
  fecha_inicio: string
  created_at: string
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null
  servicios: { nombre: string } | null
  profesionales: { nombre: string } | null
}

export function consultaSenasPendientes(supabase: SupabaseClient) {
  return supabase.from('citas')
    .select('id, fecha_inicio, created_at, clientes(nombre, apellido, telefono), servicios(nombre), profesionales(nombre)')
    .neq('status', 'cancelada')
    .gte('fecha_inicio', SENA_DESDE)
    .lt('fecha_inicio', SENA_HASTA)
    .is('sena_monto', null)
    .order('fecha_inicio')
}
