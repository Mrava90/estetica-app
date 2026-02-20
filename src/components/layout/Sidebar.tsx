'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, ADMIN_EMAIL } from '@/lib/constants'
import { Scissors } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function Sidebar() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || userEmail === ADMIN_EMAIL
  )

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-card lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Estetica SR</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
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
    </aside>
  )
}
