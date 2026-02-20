'use client'

import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { MobileNav } from './MobileNav'
import { UserMenu } from './UserMenu'

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <MobileNav />
          </SheetContent>
        </Sheet>
        <span className="text-lg font-semibold lg:hidden">Estetica SR</span>
      </div>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </header>
  )
}
