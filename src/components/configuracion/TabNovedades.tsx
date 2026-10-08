'use client'

/**
 * Configuracion → Novedades. El admin escribe un aviso, elige a quien le
 * llega y ve quien ya lo leyo. A cada destinataria le aparece una sola vez.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Megaphone, Trash2, Check, Clock } from 'lucide-react'
import type { AppUser } from '@/app/(dashboard)/configuracion/tipos'

interface NovedadAdmin {
  id: string
  titulo: string
  cuerpo: string
  destinatarios: string[] | null
  created_at: string
  novedades_vistas: { email: string | null; vista_at: string }[]
}

/** Las que vienen marcadas al abrir: las cuentas del dia a dia del local. */
const POR_DEFECTO = ['kwballester@', 'fabiana@', 'lola@']

const nombreCorto = (email: string) => {
  const u = email.split('@')[0]
  return u.charAt(0).toUpperCase() + u.slice(1)
}
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
})

export function TabNovedades({ users }: { users: AppUser[] }) {
  const personal = users.filter(u => !u.is_admin)
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [novedades, setNovedades] = useState<NovedadAdmin[]>([])

  // Preseleccion cuando llega la lista de usuarios
  useEffect(() => {
    setElegidas(new Set(personal.filter(u => POR_DEFECTO.some(p => u.email.startsWith(p))).map(u => u.email)))
  }, [users.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    const r = await fetch('/api/novedades?modo=admin')
    if (r.ok) setNovedades((await r.json()).novedades || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  function alternar(email: string) {
    setElegidas(prev => { const s = new Set(prev); if (s.has(email)) s.delete(email); else s.add(email); return s })
  }

  async function publicar() {
    setEnviando(true)
    try {
      const r = await fetch('/api/novedades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, cuerpo, destinatarios: [...elegidas] }),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'No se pudo publicar'); return }
      toast.success('Novedad publicada: la van a ver al entrar')
      setTitulo(''); setCuerpo('')
      cargar()
    } finally {
      setEnviando(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta novedad? A quien no la vio ya no le va a aparecer.')) return
    const r = await fetch(`/api/novedades?id=${id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Novedad borrada'); cargar() } else toast.error('No se pudo borrar')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Nueva novedad</CardTitle>
          <CardDescription>Le aparece una sola vez a cada una al entrar a la app. Cuando la cierra, no vuelve a salir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input placeholder="Ej: Cambió la política de cancelación" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea rows={5} placeholder="Qué cambió y qué tienen que hacer distinto." value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Para</Label>
            {personal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay usuarias del personal cargadas.</p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {personal.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={elegidas.has(u.email)} onCheckedChange={() => alternar(u.email)} />
                    {nombreCorto(u.email)}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button onClick={publicar} disabled={enviando || !titulo.trim() || !cuerpo.trim() || elegidas.size === 0}>
            {enviando ? 'Publicando…' : 'Publicar novedad'}
          </Button>
        </CardContent>
      </Card>

      {novedades.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Enviadas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {novedades.map(n => {
              const vistas = new Map(n.novedades_vistas.map(v => [String(v.email || '').toLowerCase(), v.vista_at]))
              return (
                <div key={n.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{n.titulo}</p>
                      <p className="text-xs text-muted-foreground">{fechaHora(n.created_at)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => borrar(n.id)} aria-label="Borrar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{n.cuerpo}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {(n.destinatarios || []).map(d => (
                      <span key={d} className={`flex items-center gap-1 ${vistas.has(d) ? 'text-green-700' : 'text-amber-700'}`}>
                        {vistas.has(d) ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {nombreCorto(d)} {vistas.has(d) ? `· vio ${fechaHora(vistas.get(d)!)}` : '· pendiente'}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
