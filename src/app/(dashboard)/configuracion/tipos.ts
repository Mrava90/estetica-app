/** Tipos y constantes compartidas de la pantalla de configuracion. */

/** Usuario de Supabase Auth, tal como lo devuelve /api/users. */
export interface AppUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_admin?: boolean
}

/** Paleta para el color con el que cada profesional se ve en el calendario. */
export const COLORES_DEFAULT = ['#6366f1', '#ec4899', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6']
