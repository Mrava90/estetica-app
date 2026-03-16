'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isAdminEmail } from '@/lib/constants'
import { Scissors, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function Sidebar() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [permisos, setPermisos] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null
      setUserEmail(email)
      if (email && !isAdminEmail(email)) {
        supabase.from('user_nav_permisos').select('href, visible').eq('user_email', email)
          .then(({ data: perms }) => {
            if (perms) {
              const map: Record<string, boolean> = {}
              perms.forEach(p => { map[p.href] = p.visible })
              setPermisos(map)
            }
          })
      }
    })
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const isAdmin = isAdminEmail(userEmail)
  const STRICT_ADMIN_HREFS = ['/facturacion', '/informes', '/actividad']
  const visibleItems = NAV_ITEMS.filter(item => {
    if (isAdmin) return true
    if (STRICT_ADMIN_HREFS.includes(item.href)) return false
    if (item.adminOnly) return permisos[item.href] === true
    return permisos[item.href] !== false
  })

  const isExpanded = !collapsed || hovered

  return (
    <aside
      className={cn(
        'hidden flex-shrink-0 border-r bg-card lg:block transition-all duration-200',
        isExpanded ? 'w-64' : 'w-16'
      )}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center border-b px-3 gap-2">
          <Scissors className="h-6 w-6 text-primary shrink-0" />
          {isExpanded && (
            <span className="text-lg font-semibold flex-1 truncate">Estetica SR</span>
          )}
          <button
            onClick={toggleCollapsed}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!isExpanded ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  !isExpanded ? 'justify-center' : 'gap-3',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {isExpanded && item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
