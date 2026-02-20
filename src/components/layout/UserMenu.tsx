'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Moon, Sun } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

export function UserMenu() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : '?'

  const isDark = mounted && theme === 'dark'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            setTheme(isDark ? 'light' : 'dark')
          }}
          className="cursor-pointer"
        >
          {isDark ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="flex-1">Modo oscuro</span>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            className="pointer-events-none scale-75"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          variant="destructive"
          className="cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
