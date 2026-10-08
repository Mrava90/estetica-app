'use client'

/**
 * Muestra al entrar las novedades que la usuaria todavia no cerro, de a una.
 * "Entendido" la marca como vista y no vuelve a aparecer.
 */

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Megaphone } from 'lucide-react'

interface Novedad { id: string; titulo: string; cuerpo: string; created_at: string }

export function NovedadesAviso() {
  const [pendientes, setPendientes] = useState<Novedad[]>([])
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    fetch('/api/novedades?modo=pendientes')
      .then(r => (r.ok ? r.json() : { novedades: [] }))
      .then(j => setPendientes(j.novedades || []))
      .catch(() => {})
  }, [])

  const actual = pendientes[0]

  async function entendido() {
    if (!actual) return
    setCerrando(true)
    try {
      await fetch('/api/novedades/vista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: actual.id }),
      })
    } finally {
      // Aunque falle la red, que no la tape: se vuelve a mostrar la proxima vez.
      setPendientes(p => p.slice(1))
      setCerrando(false)
    }
  }

  if (!actual) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) entendido() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-fuchsia-600" />
            {actual.titulo}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Novedad del {new Date(actual.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })}
            {pendientes.length > 1 && ` · 1 de ${pendientes.length}`}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{actual.cuerpo}</p>
        <DialogFooter>
          <Button onClick={entendido} disabled={cerrando} className="w-full sm:w-auto">
            {pendientes.length > 1 ? 'Entendido, siguiente' : 'Entendido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
