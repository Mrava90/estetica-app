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
 * Anticipacion minima para que una clienta cancele su turno desde
 * /reservar/mis-turnos. La usan el server (que la hace cumplir) y la
 * pantalla (que muestra o esconde el boton), y se le avisa a la clienta al
 * reservar y en el mail de confirmacion. Era 24; 8 desde el 08/10/2026.
 */
export const HORAS_MINIMAS_CANCELAR = 8

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

/**
 * Una seccion que vive como pestaña dentro de otro item del menu.
 * Conserva su href original: es la clave de permiso en user_nav_permisos y
 * la direccion vieja redirige a la pestaña.
 */
export interface PestanaNav {
  valor: string        // ?tab=<valor>
  label: string
  href: string         // clave de permiso (y ruta vieja que redirige)
  icon: LucideIcon
  adminOnly?: boolean  // como en NavItem: oculta salvo permiso explicito
  soloAdmin?: boolean  // ni con permiso: solo admin (Contabilidad)
}

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Secciones que se muestran como pestañas dentro de este item. */
  pestanas?: PestanaNav[]
}

/**
 * Si una usuaria ve una seccion (item o pestaña). Misma regla que tenia el
 * menu: el admin ve todo; lo adminOnly solo con permiso explicito; el resto
 * salvo que se lo hayan quitado.
 */
export function puedeVerSeccion(
  s: { href: string; adminOnly?: boolean; soloAdmin?: boolean },
  isAdmin: boolean,
  permisos: Record<string, boolean>,
): boolean {
  if (isAdmin) return true
  if (s.soloAdmin) return false
  if (s.adminOnly) return permisos[s.href] === true
  return permisos[s.href] !== false
}

/** El item aparece en el menu si la usuaria ve el item o alguna de sus pestañas. */
export function itemNavVisible(item: NavItem, isAdmin: boolean, permisos: Record<string, boolean>): boolean {
  return puedeVerSeccion(item, isAdmin, permisos) ||
    (item.pestanas || []).some(p => puedeVerSeccion(p, isAdmin, permisos))
}

// 9 items (eran 14 hasta el 08/10/2026): AFIP, Contabilidad, Accesos,
// Promociones y Actividad pasaron a ser pestañas. Sus rutas viejas redirigen.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, adminOnly: true },
  { label: 'Calendario', href: '/calendario', icon: CalendarDays },
  { label: 'Caja Diaria', href: '/caja', icon: Wallet },
  { label: 'Clientes', href: '/clientes', icon: Users, pestanas: [
    { valor: 'accesos', label: 'Accesos', href: '/accesos', icon: KeyRound, adminOnly: true },
  ] },
  { label: 'Servicios', href: '/servicios', icon: Scissors, pestanas: [
    { valor: 'promociones', label: 'Promociones', href: '/promociones', icon: Sparkles, adminOnly: true },
  ] },
  { label: 'Personal', href: '/personal', icon: UserCog },
  { label: 'Facturación', href: '/facturacion', icon: Receipt, adminOnly: true, pestanas: [
    { valor: 'monotributo', label: 'Monotributo (AFIP)', href: '/afip', icon: FileText, adminOnly: true },
  ] },
  { label: 'Informes', href: '/informes', icon: BarChart3, adminOnly: true, pestanas: [
    { valor: 'contabilidad', label: 'Contabilidad', href: '/contabilidad', icon: Calculator, adminOnly: true, soloAdmin: true },
  ] },
  { label: 'Configuración', href: '/configuracion', icon: Settings, pestanas: [
    { valor: 'actividad', label: 'Actividad', href: '/actividad', icon: Activity, adminOnly: true },
  ] },
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
