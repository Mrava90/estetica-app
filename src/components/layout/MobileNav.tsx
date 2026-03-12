'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isAdminEmail } from '@/lib/constants'
import { Scissors } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function MobileNav({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [permisos, setPermisos] = useState<Record<string, boolean>>({})

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

  const isAdmin = isAdminEmail(userEmail)
  const STRICT_ADMIN_HREFS = ['/facturacion', '/informes']
  const visibleItems = NAV_ITEMS.filter(item => {
    if (isAdmin) return true
    if (STRICT_ADMIN_HREFS.includes(item.href)) return false
    if (item.adminOnly) return permisos[item.href] === true
    return permisos[item.href] !== false
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Scissors className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">Estética SR</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
