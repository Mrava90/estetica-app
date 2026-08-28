'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MessageCircle, Check, Loader2, Phone, Sparkles, X, RotateCcw } from 'lucide-react'

interface ReengancheItem {
  cita_id: string
  cliente_id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  fecha_servicio: string
  servicio_nombre: string
  profesional_nombre: string | null
  dias_transcurridos: number
}

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'pendientes' | 'enviados'

export function ReenganchesDialog({ open, onClose }: Props) {
  const [items, setItems] = useState<ReengancheItem[]>([])
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('pendientes')

  const fetchData = useCallback(async (t: Tab = tab) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reenganches?tipo=${t}`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items || [])
        setTemplate(data.mensaje_template || '')
      } else {
        toast.error(data.error || 'Error al cargar')
      }
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    if (open) fetchData(tab)
  }, [open, tab, fetchData])

  function buildMensaje(item: ReengancheItem): string {
    const fecha = format(new Date(item.fecha_servicio), "d 'de' MMMM", { locale: es })
    return template
      .replace(/\{nombre\}/g, item.nombre || '')
      .replace(/\{apellido\}/g, item.apellido || '')
      .replace(/\{servicio\}/g, item.servicio_nombre || 'servicio')
      .replace(/\{profesional\}/g, item.profesional_nombre || '')
      .replace(/\{fecha\}/g, fecha)
      .replace(/\{dias\}/g, String(item.dias_transcurridos))
  }

  async function marcarEnviado(item: ReengancheItem, enviado: boolean = true): Promise<boolean> {
    // Mandamos cliente_id + fecha_visita directo (no dependemos del cita_id que puede
    // volverse stale entre carga de la lista y el click, por el sync-sheets diario).
    const res = await fetch('/api/reenganches/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: item.cliente_id,
        fecha_visita: item.fecha_servicio,
        enviado,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'No se pudo marcar el envío. Reintentá.')
      return false
    }
    return true
  }

  async function desmarcar(item: ReengancheItem) {
    if (!confirm(`Devolver a ${item.nombre} a pendientes? Podrás volver a enviarle el WhatsApp.`)) return
    setEnviando(item.cita_id)
    try {
      const ok = await marcarEnviado(item, false)
      if (ok) {
        setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
        toast.success('Devuelto a pendientes')
      }
    } finally {
      setEnviando(null)
    }
  }

  async function abrirWhatsApp(item: ReengancheItem) {
    if (!item.telefono) {
      toast.error('El cliente no tiene teléfono')
      return
    }
    let num = item.telefono.replace(/[\s\-().+]/g, '')
    if (num.startsWith('0')) num = num.slice(1)
    if (!num.startsWith('54')) num = `54${num}`
    const mensaje = encodeURIComponent(buildMensaje(item))
    window.open(`https://wa.me/${num}?text=${mensaje}`, '_blank')

    // Auto-marcar como enviado y sacarlo del listado
    setEnviando(item.cita_id)
    try {
      const ok = await marcarEnviado(item)
      if (ok) setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
    } finally {
      setEnviando(null)
    }
  }

  async function ocultarSinEnviar(item: ReengancheItem) {
    if (!confirm(`Marcar a ${item.nombre} como "no enviar" (no vuelve a aparecer)?`)) return
    setEnviando(item.cita_id)
    try {
      const ok = await marcarEnviado(item)
      if (ok) {
        setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
        toast.success('Ocultado')
      }
    } finally {
      setEnviando(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fuchsia-500" />
            Recordatorio de servicios
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {tab === 'pendientes'
              ? 'Clientes atendidos hace 21-28 días que aún no volvieron. Ideal para recontactar y captar un nuevo turno.'
              : 'Clientes que ya fueron marcados como contactados en los últimos 60 días. Podés devolverlos a pendientes si el WhatsApp no se envió.'}
          </p>

          {/* Tabs */}
          <div className="flex gap-1 pt-3 border-b -mx-6 px-6">
            <button
              onClick={() => setTab('pendientes')}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'pendientes'
                  ? 'border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setTab('enviados')}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'enviados'
                  ? 'border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Enviados
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {tab === 'pendientes' ? 'Ningún cliente pendiente de reenganche hoy.' : 'Aún no hay ningún cliente marcado como enviado.'}
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                {tab === 'pendientes'
                  ? 'Aparecen clientes que se atendieron hace 21-28 días y no volvieron ni tienen turno próximo.'
                  : 'Los envíos de los últimos 60 días aparecen acá.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map(item => {
                const nombreCompleto = `${item.nombre}${item.apellido ? ' ' + item.apellido : ''}`
                const isEnviando = enviando === item.cita_id
                return (
                  <div key={item.cita_id} className="py-3 px-2 flex items-center gap-3 hover:bg-muted/30 rounded transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{nombreCompleto}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          hace <strong className="text-foreground">{item.dias_transcurridos} días</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span className="truncate">{item.servicio_nombre}</span>
                        {item.profesional_nombre && (
                          <span className="text-muted-foreground/70">con {item.profesional_nombre}</span>
                        )}
                        {item.telefono && (
                          <span className="flex items-center gap-1 text-muted-foreground/70">
                            <Phone className="h-3 w-3" />
                            {item.telefono}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tab === 'pendientes' ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => ocultarSinEnviar(item)}
                            disabled={isEnviando}
                            title="Ocultar sin enviar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-green-600 hover:bg-green-700"
                            onClick={() => abrirWhatsApp(item)}
                            disabled={isEnviando || !item.telefono}
                          >
                            {isEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                            WhatsApp
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            onClick={() => desmarcar(item)}
                            disabled={isEnviando}
                            title="Devolver a pendientes"
                          >
                            {isEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Reenviar
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-green-600 hover:bg-green-700"
                            onClick={() => abrirWhatsApp(item)}
                            disabled={isEnviando || !item.telefono}
                            title="Reenviar WhatsApp (queda marcado como enviado)"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="shrink-0 pt-2 border-t text-[11px] text-muted-foreground">
            💡 Al enviar el WhatsApp, se marca como enviado y no vuelve a aparecer.
            El mensaje se puede editar desde <strong>Configuración → Mensaje de reenganche</strong>.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
