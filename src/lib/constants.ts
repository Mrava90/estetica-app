import {
  CalendarDays,
  Users,
  UserCog,
  Scissors,
  LayoutDashboard,
  Settings,
  BarChart3,
  Wallet,
  Calculator,
  Receipt,
  Activity,
  KeyRound,
  FileText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export const ADMIN_EMAILS = ['ravamartin@gmail.com']

/**
 * @deprecated Preferir isAdminUser(user) que lee de app_metadata.role.
 * Se mantiene como fallback para transicion.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email)
}

/** @deprecated */
export const ADMIN_EMAIL = ADMIN_EMAILS[0]

// Shape minimo de un user de Supabase Auth para inferir rol.
// Usa Record generico para compat con `User` de @supabase/supabase-js
// (que tiene app_metadata: UserAppMetadata con otras keys ademas de role).
interface UserWithMetadata {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

/**
 * Verifica si un user tiene rol admin. Preferido sobre isAdminEmail.
 * Lee de app_metadata.role. Fallback a la lista ADMIN_EMAILS por compat.
 */
export function isAdminUser(user: UserWithMetadata | null | undefined): boolean {
  if (!user) return false
  if ((user.app_metadata as { role?: string } | null)?.role === 'admin') return true
  return isAdminEmail(user.email)
}

/**
 * Verifica si un user tiene rol staff O admin (personal con acceso al dashboard).
 * Lee de app_metadata.role. Fallback a dominio @estetica.local + ADMIN_EMAILS.
 */
export function isStaffUser(user: UserWithMetadata | null | undefined): boolean {
  if (!user) return false
  const role = (user.app_metadata as { role?: string } | null)?.role
  if (role === 'admin' || role === 'staff') return true
  return isAdminEmail(user.email) || (user.email?.endsWith('@estetica.local') ?? false)
}

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, adminOnly: true },
  { label: 'Calendario', href: '/calendario', icon: CalendarDays },
  { label: 'Caja Diaria', href: '/caja', icon: Wallet },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Servicios', href: '/servicios', icon: Scissors },
  { label: 'Personal', href: '/personal', icon: UserCog },
  { label: 'Promociones', href: '/promociones', icon: Sparkles, adminOnly: true },
  { label: 'Informes', href: '/informes', icon: BarChart3, adminOnly: true },
  { label: 'Contabilidad', href: '/contabilidad', icon: Calculator, adminOnly: true },
  { label: 'Facturación', href: '/facturacion', icon: Receipt, adminOnly: true },
  { label: 'AFIP', href: '/afip', icon: FileText, adminOnly: true },
  { label: 'Actividad', href: '/actividad', icon: Activity, adminOnly: true },
  { label: 'Accesos', href: '/accesos', icon: KeyRound, adminOnly: true },
  { label: 'Configuración', href: '/configuracion', icon: Settings },
]

export const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

export const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-blue-100 text-blue-800',
  completada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
  no_asistio: 'bg-gray-100 text-gray-800',
}

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
]
