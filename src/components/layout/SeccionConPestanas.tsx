'use client'

/**
 * Pagina de un item del menu que agrupa varias secciones como pestañas
 * (ej. Facturacion = Facturas + Monotributo). Las pestañas salen de
 * NAV_ITEMS[].pestanas y cada usuaria ve solo las que tiene permitidas
 * (misma regla que el menu: puedeVerSeccion). La pestaña activa queda en
 * ?tab= para que los enlaces y las rutas viejas caigan en la correcta.
 *
 * Mientras se cargan los permisos no muestra nada: asi una pestaña de admin
 * nunca se ve, ni por un instante, a quien no corresponde.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, isAdminUser, puedeVerSeccion } from '@/lib/constants'
import { Loader2 } from 'lucide-react'

interface Props {
  /** href del item en NAV_ITEMS */
  href: string
  /** La seccion propia del item: su pestaña y su contenido. */
  principal: { valor: string; label: string; contenido: ReactNode }
  /** Contenido de cada pestaña extra, por su `valor` en NAV_ITEMS. */
  contenidos: Record<string, ReactNode>
}

export function SeccionConPestanas({ href, principal, contenidos }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [permisos, setPermisos] = useState<{ isAdmin: boolean; mapa: Record<string, boolean> } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const isAdmin = isAdminUser(data.user)
      const mapa: Record<string, boolean> = {}
      if (!isAdmin && data.user?.email) {
        const { data: perms } = await supabase.from('user_nav_permisos').select('href, visible').eq('user_email', data.user.email)
        for (const p of perms || []) mapa[p.href] = p.visible
      }
      setPermisos({ isAdmin, mapa })
    })
  }, [])

  const item = NAV_ITEMS.find(i => i.href === href)

  const visibles = useMemo(() => {
    if (!permisos || !item) return []
    const lista = [
      { valor: principal.valor, label: principal.label, icon: item.icon, contenido: principal.contenido, ve: puedeVerSeccion(item, permisos.isAdmin, permisos.mapa) },
      ...(item.pestanas || []).map(p => ({ valor: p.valor, label: p.label, icon: p.icon, contenido: contenidos[p.valor], ve: puedeVerSeccion(p, permisos.isAdmin, permisos.mapa) })),
    ]
    return lista.filter(p => p.ve && p.contenido)
  }, [permisos, item, principal, contenidos])

  if (!permisos) {
    return <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }
  if (visibles.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No tenés acceso a esta sección.</p>
  }
  if (visibles.length === 1) return <>{visibles[0].contenido}</>

  const pedida = params.get('tab')
  const activa = visibles.some(v => v.valor === pedida) ? pedida! : visibles[0].valor

  function cambiar(valor: string) {
    const q = new URLSearchParams(params.toString())
    if (valor === visibles[0].valor) q.delete('tab'); else q.set('tab', valor)
    const s = q.toString()
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }

  return (
    <Tabs value={activa} onValueChange={cambiar}>
      <TabsList variant="line" className="mb-4">
        {visibles.map(v => (
          <TabsTrigger key={v.valor} value={v.valor} className="gap-1.5">
            <v.icon className="h-4 w-4" />
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {visibles.map(v => (
        <TabsContent key={v.valor} value={v.valor}>{v.contenido}</TabsContent>
      ))}
    </Tabs>
  )
}
