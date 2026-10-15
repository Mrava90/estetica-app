'use client'

import { useEffect, useState, useCallback } from 'react'
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MessageCircle, Loader2, Phone, Sparkles, X, RotateCcw, CalendarClock, BellRing } from 'lucide-react'

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
  /** Recordatorio pospuesto (ver /api/reenganches/posponer) */
  pospuesto?: { hasta: string; nota: string | null } | null
}

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'pendientes' | 'programadas' | 'enviados'

const TABS: { valor: Tab; label: string }[] = [
  { valor: 'pendientes', label: 'Pendientes' },
  { valor: 'programadas', label: 'Programadas' },
  { valor: 'enviados', label: 'Enviados' },
]

/** Atajos para posponer, en dias desde hoy. */
const ATAJOS = [
  { label: '3 días', dias: 3 },
  { label: '1 semana', dias: 7 },
  { label: '2 semanas', dias: 14 },
]

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
/** "2026-10-21" → "mié 21/10" */
const diaCorto = (s: string) => format(new Date(s + 'T12:00:00'), 'EEE d/MM', { locale: es })

export function ReenganchesDialog({ open, onClose }: Props) {
  const [items, setItems] = useState<ReengancheItem[]>([])
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('pendientes')
  // Panel de posponer abierto (cita_id de la fila) y sus campos
  const [posponiendo, setPosponiendo] = useState<string | null>(null)
  const [fechaPos, setFechaPos] = useState('')
  const [notaPos, setNotaPos] = useState('')

  const fetchData = useCallback(async (t: Tab = tab) => {
    setLoading(true)
    setPosponiendo(null)
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

    // Auto-marcar como enviado (y, si estaba pospuesta, la cumple) y sacarlo del listado
    setEnviando(item.cita_id)
    try {
      const ok = await marcarEnviado(item)
      if (ok && tab !== 'enviados') setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
      if (ok && tab === 'enviados') setItems(prev => prev.map(i => i.cita_id === item.cita_id ? { ...i, pospuesto: null } : i))
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

  // ── Posponer ──────────────────────────────────────────────

  function abrirPosponer(item: ReengancheItem) {
    if (posponiendo === item.cita_id) { setPosponiendo(null); return }
    setPosponiendo(item.cita_id)
    setFechaPos(item.pospuesto?.hasta || ymd(addDays(new Date(), 7)))
    setNotaPos(item.pospuesto?.nota || '')
  }

  async function guardarPosponer(item: ReengancheItem) {
    if (!fechaPos || fechaPos <= ymd(new Date())) {
      toast.error('Elegí una fecha posterior a hoy')
      return
    }
    setEnviando(item.cita_id)
    try {
      const res = await fetch('/api/reenganches/posponer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: item.cliente_id,
          hasta: fechaPos,
          nota: notaPos,
          fecha_visita: item.fecha_servicio,
          servicio_nombre: item.servicio_nombre,
          profesional_nombre: item.profesional_nombre,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'No se pudo posponer')
        return
      }
      toast.success(`Te la recuerdo el ${diaCorto(fechaPos)}`)
      setPosponiendo(null)
      const pospuesto = { hasta: fechaPos, nota: notaPos.trim() || null }
      if (tab === 'pendientes') setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
      else if (tab === 'enviados') setItems(prev => prev.map(i => i.cita_id === item.cita_id ? { ...i, pospuesto } : i))
      else fetchData('programadas')
    } finally {
      setEnviando(null)
    }
  }

  async function quitarPospuesto(item: ReengancheItem) {
    if (!confirm(`¿Quitar el recordatorio de ${item.nombre}?`)) return
    setEnviando(item.cita_id)
    try {
      const res = await fetch('/api/reenganches/posponer', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: item.cliente_id }),
      })
      if (!res.ok) { toast.error('No se pudo quitar'); return }
      toast.success('Recordatorio quitado')
      if (tab === 'programadas') setItems(prev => prev.filter(i => i.cita_id !== item.cita_id))
      else setItems(prev => prev.map(i => i.cita_id === item.cita_id ? { ...i, pospuesto: null } : i))
    } finally {
      setEnviando(null)
    }
  }

  const descripcion = {
    pendientes: 'Clientes atendidos hace 21-28 días que aún no volvieron, y los recordatorios pospuestos que vencen hoy.',
    programadas: 'Recordatorios pospuestos. Cada uno vuelve a Pendientes el día indicado, salvo que la clienta saque turno antes.',
    enviados: 'Clientes que ya fueron marcados como contactados en los últimos 60 días. Si te pidió que la contactes más adelante, usá Posponer.',
  }[tab]

  const vacio = {
    pendientes: ['Ningún cliente pendiente de reenganche hoy.', 'Aparecen clientes que se atendieron hace 21-28 días y no volvieron ni tienen turno próximo.'],
    programadas: ['No hay recordatorios programados.', 'Usá "Posponer" en Pendientes o Enviados cuando una clienta te pida que la contactes más adelante.'],
    enviados: ['Aún no hay ningún cliente marcado como enviado.', 'Los envíos de los últimos 60 días aparecen acá.'],
  }[tab]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fuchsia-500" />
            Recordatorio de servicios
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">{descripcion}</p>

          {/* Tabs */}
          <div className="flex gap-1 pt-3 border-b -mx-6 px-6">
            {TABS.map(t => (
              <button
                key={t.valor}
                onClick={() => setTab(t.valor)}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.valor
                    ? 'border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
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
              <p className="text-sm text-muted-foreground">{vacio[0]}</p>
              <p className="text-[11px] text-muted-foreground/70">{vacio[1]}</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map(item => {
                const nombreCompleto = `${item.nombre}${item.apellido ? ' ' + item.apellido : ''}`
                const isEnviando = enviando === item.cita_id
                const panelAbierto = posponiendo === item.cita_id
                return (
                  <div key={item.cita_id} className="py-3 px-2 rounded hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
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
                        {item.pospuesto && (
                          <p className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                            tab === 'pendientes' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300'
                          }`}>
                            {tab === 'pendientes' ? <BellRing className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                            {tab === 'pendientes' ? 'Recordatorio pospuesto' : `Vuelve el ${diaCorto(item.pospuesto.hasta)}`}
                            {item.pospuesto.nota && <span className="text-current/80">· {item.pospuesto.nota}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {tab === 'pendientes' && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => ocultarSinEnviar(item)} disabled={isEnviando} title="Ocultar sin enviar">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        {tab === 'enviados' && (
                          <Button size="sm" variant="outline" className="h-8 gap-1.5"
                            onClick={() => desmarcar(item)} disabled={isEnviando} title="Devolver a pendientes">
                            {isEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            <span className="hidden sm:inline">Reenviar</span>
                          </Button>
                        )}
                        {tab === 'programadas' && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => quitarPospuesto(item)} disabled={isEnviando} title="Quitar recordatorio">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant={panelAbierto ? 'secondary' : 'outline'} className="h-8 gap-1.5"
                          onClick={() => abrirPosponer(item)} disabled={isEnviando}
                          title={item.pospuesto ? 'Cambiar la fecha del recordatorio' : 'Recordármelo otro día'}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{tab === 'programadas' ? 'Cambiar' : 'Posponer'}</span>
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5 bg-green-600 hover:bg-green-700"
                          onClick={() => abrirWhatsApp(item)} disabled={isEnviando || !item.telefono}
                          title={tab === 'enviados' ? 'Reenviar WhatsApp (queda marcado como enviado)' : undefined}>
                          {isEnviando && tab !== 'enviados' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                          WhatsApp
                        </Button>
                      </div>
                    </div>

                    {/* Panel de posponer */}
                    {panelAbierto && (
                      <div className="mt-2 ml-1 rounded-md border-l-2 border-fuchsia-400 bg-muted/40 px-3 py-2.5 space-y-2">
                        <p className="text-xs font-medium">¿Cuándo te la recuerdo?</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ATAJOS.map(a => {
                            const f = ymd(addDays(new Date(), a.dias))
                            return (
                              <button key={a.dias} type="button" onClick={() => setFechaPos(f)}
                                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${fechaPos === f ? 'border-fuchsia-500 bg-fuchsia-500 text-white' : 'bg-background hover:bg-muted'}`}>
                                {a.label}
                              </button>
                            )
                          })}
                          <input type="date" value={fechaPos} min={ymd(addDays(new Date(), 1))}
                            onChange={e => setFechaPos(e.target.value)}
                            className="h-7 rounded-md border bg-background px-2 text-xs" />
                          {fechaPos && <span className="text-xs text-muted-foreground">→ {diaCorto(fechaPos)}</span>}
                        </div>
                        <input type="text" value={notaPos} onChange={e => setNotaPos(e.target.value)} maxLength={200}
                          placeholder="Nota (opcional): ej. puede recién la semana que viene"
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs" />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setPosponiendo(null)}>Cancelar</Button>
                          <Button size="sm" className="h-7" onClick={() => guardarPosponer(item)} disabled={isEnviando}>
                            {isEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="shrink-0 pt-2 border-t text-[11px] text-muted-foreground">
            💡 Al enviar el WhatsApp, se marca como enviado y no vuelve a aparecer.
            Si la clienta te pide que la contactes más adelante, usá <strong>Posponer</strong>: vuelve a Pendientes ese día.
            El mensaje se puede editar desde <strong>Configuración → Mensaje de reenganche</strong>.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
