'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Bloqueo, Desbloqueo, Horario } from '@/types/database'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2, Unlock, Lock } from 'lucide-react'

// Generate time options every 15 min
const TIME_OPTIONS: string[] = []
for (let h = 8; h <= 21; h++) {
  for (const m of [0, 15, 30, 45]) {
    if (h === 21 && m > 0) continue
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

interface Props {
  open: boolean
  onClose: () => void
  bloqueo: Bloqueo | null
  desbloqueo?: Desbloqueo | null
  profesionalId: string | null
  profesionalNombre: string
  fecha: Date
  defaultStart?: string
  defaultEnd?: string
  horarios?: Horario[]
}

export function BloqueoDialog({
  open,
  onClose,
  bloqueo,
  desbloqueo = null,
  profesionalId,
  profesionalNombre,
  fecha,
  defaultStart,
  defaultEnd,
  horarios = [],
}: Props) {
  const [horaInicio, setHoraInicio] = useState(defaultStart || '10:00')
  const [horaFin, setHoraFin] = useState(defaultEnd || '11:00')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState<'bloquear' | 'desbloquear'>('bloquear')
  const supabase = createClient()

  const isEditingBloqueo = !!bloqueo
  const isEditingDesbloqueo = !!desbloqueo

  // Determinar si el profesional NO trabaja este día
  const diaSemana = fecha.getDay()
  const noTrabajaHoy = profesionalId
    ? horarios.filter((h) => h.profesional_id === profesionalId && h.dia_semana === diaSemana).length === 0
    : false

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    if (bloqueo) {
      const start = new Date(bloqueo.fecha_inicio)
      const end = new Date(bloqueo.fecha_fin)
      setHoraInicio(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`)
      setHoraFin(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`)
      setMotivo(bloqueo.motivo || '')
    } else if (desbloqueo) {
      setHoraInicio(desbloqueo.hora_inicio.slice(0, 5))
      setHoraFin(desbloqueo.hora_fin.slice(0, 5))
      setMotivo(desbloqueo.motivo || '')
    } else {
      setHoraInicio(defaultStart || '10:00')
      setHoraFin(defaultEnd || '11:00')
      setMotivo('')
      // Si no trabaja hoy, default a desbloquear
      setModo(noTrabajaHoy ? 'desbloquear' : 'bloquear')
    }
  }, [open, bloqueo, desbloqueo, defaultStart, defaultEnd, noTrabajaHoy])

  async function handleCreate() {
    if (!profesionalId) return
    if (horaInicio >= horaFin) {
      toast.error('La hora de fin debe ser posterior a la de inicio')
      return
    }

    setLoading(true)
    try {
      if (modo === 'desbloquear') {
        const dateStr = format(fecha, 'yyyy-MM-dd')
        const { error } = await supabase.from('desbloqueos').insert({
          profesional_id: profesionalId,
          fecha: dateStr,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          motivo,
        })
        if (error) throw error
        toast.success('Horario habilitado')
      } else {
        const dateStr = format(fecha, 'yyyy-MM-dd')
        const { error } = await supabase.from('bloqueos').insert({
          profesional_id: profesionalId,
          fecha_inicio: `${dateStr}T${horaInicio}:00-03:00`,
          fecha_fin: `${dateStr}T${horaFin}:00-03:00`,
          motivo,
        })
        if (error) throw error
        toast.success('Horario bloqueado')
      }
      onClose()
    } catch {
      toast.error(modo === 'desbloquear' ? 'Error al habilitar horario' : 'Error al bloquear horario')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      if (bloqueo) {
        const { error } = await supabase.from('bloqueos').delete().eq('id', bloqueo.id)
        if (error) throw error
        toast.success('Bloqueo eliminado')
      } else if (desbloqueo) {
        const { error } = await supabase.from('desbloqueos').delete().eq('id', desbloqueo.id)
        if (error) throw error
        toast.success('Desbloqueo eliminado')
      }
      onClose()
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  const fechaLabel = format(fecha, "EEEE d 'de' MMMM", { locale: es })

  function getTitle() {
    if (isEditingBloqueo) return 'Bloqueo existente'
    if (isEditingDesbloqueo) return 'Horario habilitado'
    return noTrabajaHoy ? 'Gestionar horario' : 'Bloquear horario'
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{profesionalNombre}</span>
            <span className="mx-1">—</span>
            <span className="capitalize">{fechaLabel}</span>
          </div>

          {/* Crear nuevo (ni editando bloqueo ni desbloqueo) */}
          {!isEditingBloqueo && !isEditingDesbloqueo && (
            <>
              {/* Toggle bloquear/desbloquear solo si no trabaja hoy */}
              {noTrabajaHoy && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-2">
                    Este profesional no trabaja este día normalmente.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={modo === 'desbloquear' ? 'default' : 'outline'}
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => setModo('desbloquear')}
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Habilitar
                    </Button>
                    <Button
                      size="sm"
                      variant={modo === 'bloquear' ? 'default' : 'outline'}
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => setModo('bloquear')}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Bloquear
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Desde</Label>
                  <Select value={horaInicio} onValueChange={setHoraInicio}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hasta</Label>
                  <Select value={horaFin} onValueChange={setHoraFin}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input
                  placeholder={modo === 'desbloquear' ? 'Ej: Sábado especial, evento...' : 'Ej: Turno médico, personal...'}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>

              <Button onClick={handleCreate} disabled={loading} className="w-full gap-2">
                {modo === 'desbloquear' ? (
                  <>
                    <Unlock className="h-4 w-4" />
                    {loading ? 'Habilitando...' : 'Habilitar horario'}
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    {loading ? 'Bloqueando...' : 'Bloquear horario'}
                  </>
                )}
              </Button>
            </>
          )}

          {/* Editando bloqueo existente */}
          {isEditingBloqueo && bloqueo && (
            <>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm">
                  {new Date(bloqueo.fecha_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  {' - '}
                  {new Date(bloqueo.fecha_fin).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {bloqueo.motivo && <p className="text-xs text-muted-foreground">{bloqueo.motivo}</p>}
              </div>

              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="w-full gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {loading ? 'Eliminando...' : 'Eliminar bloqueo'}
              </Button>
            </>
          )}

          {/* Editando desbloqueo existente */}
          {isEditingDesbloqueo && desbloqueo && (
            <>
              <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700 p-3 space-y-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {desbloqueo.hora_inicio.slice(0, 5)} - {desbloqueo.hora_fin.slice(0, 5)}
                </p>
                {desbloqueo.motivo && <p className="text-xs text-green-600 dark:text-green-500">{desbloqueo.motivo}</p>}
              </div>

              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="w-full gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {loading ? 'Eliminando...' : 'Quitar habilitación'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
