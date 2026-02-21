import {
  CalendarDays,
  Users,
  Scissors,
  UserCircle,
  LayoutDashboard,
  Settings,
  BarChart3,
  Wallet,
  Calculator,
  type LucideIcon,
} from 'lucide-react'

export const ADMIN_EMAIL = 'ravamartin@gmail.com'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Calendario', href: '/calendario', icon: CalendarDays },
  { label: 'Caja Diaria', href: '/caja', icon: Wallet },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Servicios', href: '/servicios', icon: Scissors },
  { label: 'Equipo', href: '/equipo', icon: UserCircle },
  { label: 'Informes', href: '/informes', icon: BarChart3 },
  { label: 'Contabilidad', href: '/contabilidad', icon: Calculator, adminOnly: true },
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
