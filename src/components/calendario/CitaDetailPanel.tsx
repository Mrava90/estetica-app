'use client'

import { useState } from 'react'
import type { CitaConRelaciones } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { MessageCircle, Pencil, X, Banknote, Smartphone, Building2, Clock, Scissors, BadgeDollarSign } from 'lucide-react'

/** Seña fija (diciembre 2026). */
const SENA_MONTO = 15000
const MEDIOS_SENA: Record<string, string> = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia', efectivo: 'Efectivo' }

type Sena = { sena_monto: number | null; sena_medio: string | null; sena_fecha: string | null }

interface Props {
  open: boolean
  cita: CitaConRelaciones | null
  onClose: () => void
  onEdit?: () => void
  readOnly?: boolean
}

export function CitaDetailPanel({ open, cita, onClose, onEdit, readOnly }: Props) {
  const [loading, setLoading] = useState(false)
  // Seña: lo recien guardado pisa lo que vino en la cita (hasta que se recargue)
  const [senaLocal, setSenaLocal] = useState<{ id: string; sena: Sena } | null>(null)
  const [cargandoSena, setCargandoSena] = useState(false)
  const [medioSena, setMedioSena] = useState('mercadopago')
  const [montoSena, setMontoSena] = useState(String(SENA_MONTO))
  const supabase = createClient()

  if (!cita) return null

  const sena: Sena = senaLocal?.id === cita.id ? senaLocal.sena
    : { sena_monto: cita.sena_monto ?? null, sena_medio: cita.sena_medio ?? null, sena_fecha: cita.sena_fecha ?? null }
  const precioTurno = cita.precio_cobrado ?? cita.servicios?.precio_efectivo ?? null
  const saldo = sena.sena_monto && precioTurno != null ? Math.max(0, precioTurno - sena.sena_monto) : null
  const fechaSena = sena.sena_fecha ? sena.sena_fecha.split('-').reverse().slice(0, 2).join('/') : ''

  async function guardarSena(nueva: Sena) {
    setLoading(true)
    const { error } = await supabase.from('citas').update({ ...nueva, updated_at: new Date().toISOString() }).eq('id', cita!.id)
    setLoading(false)
    if (error) { toast.error('No se pudo guardar la seña: ' + error.message); return }
    setSenaLocal({ id: cita!.id, sena: nueva })
    setCargandoSena(false)
    toast.success(nueva.sena_monto ? 'Seña registrada' : 'Seña quitada')
  }

  function registrarSena() {
    const hoy = new Date()
    const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const monto = Number(montoSena.replace(/\D/g, ''))
    if (!monto) { toast.error('Poné el monto de la seña'); return }
    guardarSena({ sena_monto: monto, sena_medio: medioSena, sena_fecha: ymd })
  }

  function quitarSena() {
    if (!confirm('¿Quitar la seña de este turno?')) return
    guardarSena({ sena_monto: null, sena_medio: null, sena_fecha: null })
  }

  const inicio = new Date(cita.fecha_inicio)
  const fin = new Date(cita.fecha_fin)
  const duracion = Math.round((fin.getTime() - inicio.getTime()) / 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const horaInicio = `${pad(inicio.getHours())}:${pad(inicio.getMinutes())}`
  const horaFin = `${pad(fin.getHours())}:${pad(fin.getMinutes())}`

  const fechaStr = inicio.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo',
    mercadopago: 'Mercado Pago',
    transferencia: 'Transferencia',
  }

  async function handleAnular() {
    const avisoSena = sena.sena_monto ? `\n\n⚠️ Este turno tiene una SEÑA PAGA de ${formatPrecio(sena.sena_monto)}. Si la clienta reprograma, registrásela en el turno nuevo.` : ''
    if (!confirm(`¿Anular esta cita?${avisoSena}`)) return
    setLoading(true)
    const { error } = await supabase
      .from('citas')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', cita!.id)
    setLoading(false)
    if (error) {
      toast.error('Error al anular la cita')
    } else {
      toast.success('Cita anulada')
      onClose()
    }
  }

  async function handleEliminar() {
    const avisoSena = sena.sena_monto ? `\n\n⚠️ Este turno tiene una SEÑA PAGA de ${formatPrecio(sena.sena_monto)}.` : ''
    if (!confirm(`¿Eliminar esta cita permanentemente? Esta acción no se puede deshacer.${avisoSena}`)) return
    setLoading(true)
    const { error } = await supabase.from('citas').delete().eq('id', cita!.id)
    setLoading(false)
    if (error) {
      toast.error('Error al eliminar la cita')
    } else {
      toast.success('Cita eliminada')
      onClose()
    }
  }

  function handleWhatsApp() {
    if (!cita?.clientes?.telefono) return
    const tel = cita.clientes.telefono.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Hola ${cita.clientes.nombre}! 👋 Te recordamos tu turno:\n\n🗓 ${fechaStr}\n🕐 ${horaInicio} – ${horaFin}\n💅 ${cita.servicios?.nombre || 'tu servicio'}\n\n¡Te esperamos!`
    )
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 space-y-3">

          {/* Status + fecha */}
          <div className="flex items-center justify-between gap-2">
            <Badge className={`${STATUS_COLORS[cita.status]} text-xs`}>
              {STATUS_LABELS[cita.status]}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize truncate">{fechaStr}</span>
          </div>

          {/* Nombre + teléfono */}
          <div>
            <p className="text-xl font-bold leading-tight">{cita.clientes ? (cita.clientes.apellido ? `${cita.clientes.nombre} ${cita.clientes.apellido}` : cita.clientes.nombre) : 'Sin cliente'}</p>
            {cita.clientes?.telefono && (
              <p className="text-sm text-muted-foreground mt-0.5">{cita.clientes.telefono}</p>
            )}
          </div>

          {/* WhatsApp */}
          {!readOnly && cita.clientes?.telefono && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleWhatsApp}
              className="w-full gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
            >
              <MessageCircle className="h-4 w-4" />
              Enviar recordatorio por WhatsApp
            </Button>
          )}
        </div>

        <Separator />

        {/* ── Detalle ── */}
        <div className="px-5 py-4 space-y-3">

          {/* Hora */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{horaInicio} – {horaFin}</p>
              <p className="text-xs text-muted-foreground">{duracion} minutos</p>
            </div>
          </div>

          {/* Servicio + método */}
          {cita.servicios && (
            <div className="flex items-start gap-3">
              <Scissors className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{cita.servicios.nombre}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  {cita.metodo_pago === 'mercadopago' ? (
                    <Smartphone className="h-3 w-3" />
                  ) : cita.metodo_pago === 'transferencia' ? (
                    <Building2 className="h-3 w-3" />
                  ) : (
                    <Banknote className="h-3 w-3" />
                  )}
                  {metodoLabel[cita.metodo_pago || 'efectivo'] || 'Efectivo'}
                </div>
              </div>
            </div>
          )}

          {/* Seña */}
          {sena.sena_monto ? (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <BadgeDollarSign className="h-4 w-4" /> Seña paga {formatPrecio(sena.sena_monto)}
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  {MEDIOS_SENA[sena.sena_medio || ''] || sena.sena_medio}{fechaSena ? ` · ${fechaSena}` : ''}
                </span>
              </div>
              {saldo != null && (
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  Cobrar en el turno: <span className="font-bold">{formatPrecio(saldo)}</span>
                  <span className="text-xs text-amber-700 dark:text-amber-400"> ({formatPrecio(precioTurno!)} − seña)</span>
                </p>
              )}
              {!readOnly && (
                <button type="button" onClick={quitarSena} disabled={loading} className="text-[11px] text-amber-700 hover:text-destructive hover:underline">
                  Quitar seña
                </button>
              )}
            </div>
          ) : !readOnly && cita.status !== 'cancelada' && (
            cargandoSena ? (
              <div className="rounded-lg border border-dashed px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Seña paga $</p>
                  <input inputMode="numeric" value={montoSena} onChange={e => setMontoSena(e.target.value)}
                    className="h-7 w-24 rounded-md border bg-background px-2 text-sm" aria-label="Monto de la seña" />
                </div>
                <p className="text-xs text-muted-foreground">¿Cómo la pagó?</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(MEDIOS_SENA).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setMedioSena(v)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${medioSena === v ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' : 'text-muted-foreground'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={registrarSena} disabled={loading}>Registrar seña</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCargandoSena(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setCargandoSena(true)}>
                <BadgeDollarSign className="h-4 w-4" /> ¿Pagó seña? Registrarla
              </Button>
            )
          )}

          {/* Monto */}
          {cita.precio_cobrado != null && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">{sena.sena_monto ? 'Precio del turno' : 'Monto cobrado'}</span>
              <span className="text-base font-bold">{formatPrecio(cita.precio_cobrado)}</span>
            </div>
          )}

          {/* Profesional */}
          {cita.profesionales && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="inline-block h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: cita.profesionales.color || '#888' }}
              />
              {cita.profesionales.nombre}
            </div>
          )}

          {/* Notas */}
          {cita.notas && (
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground leading-relaxed">📝 {cita.notas}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* ── Acciones ── */}
        <div className="px-5 py-3 space-y-2">
          <div className="flex gap-2">
            {onEdit && (
              <Button onClick={onEdit} className="flex-1 gap-1.5" size="sm">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            )}
            {!readOnly && (
              <Button
                variant="outline"
                onClick={handleAnular}
                disabled={loading || cita.status === 'cancelada'}
                size="sm"
                className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
                Anular
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} size="sm" className="px-3">
              Cerrar
            </Button>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleEliminar}
              disabled={loading}
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors text-center py-0.5"
            >
              Eliminar permanentemente
            </button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  )
}
