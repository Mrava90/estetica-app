'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Bloqueo, Profesional } from '@/types/database'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'

// Generate time options every 30 min
const TIME_OPTIONS: string[] = []
for (let h = 8; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface Props {
  open: boolean
  onClose: () => void
  bloqueo: Bloqueo | null
  profesionalId: string | null
  profesionalNombre: string
  fecha: Date
  defaultStart?: string
  defaultEnd?: string
}

export function BloqueoDialog({
  open,
  onClose,
  bloqueo,
  profesionalId,
  profesionalNombre,
  fecha,
  defaultStart,
  defaultEnd,
}: Props) {
  const [horaInicio, setHoraInicio] = useState(defaultStart || '10:00')
  const [horaFin, setHoraFin] = useState(defaultEnd || '11:00')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const isEditing = !!bloqueo

  // Reset form when dialog opens
  useState(() => {
    if (bloqueo) {
      const start = new Date(bloqueo.fecha_inicio)
      const end = new Date(bloqueo.fecha_fin)
      setHoraInicio(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`)
      setHoraFin(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`)
      setMotivo(bloqueo.motivo || '')
    } else {
      setHoraInicio(defaultStart || '10:00')
      setHoraFin(defaultEnd || '11:00')
      setMotivo('')
    }
  })

  async function handleCreate() {
    if (!profesionalId) return
    if (horaInicio >= horaFin) {
      toast.error('La hora de fin debe ser posterior a la de inicio')
      return
    }

    setLoading(true)
    try {
      const dateStr = format(fecha, 'yyyy-MM-dd')
      const { error } = await supabase.from('bloqueos').insert({
        profesional_id: profesionalId,
        fecha_inicio: `${dateStr}T${horaInicio}:00`,
        fecha_fin: `${dateStr}T${horaFin}:00`,
        motivo,
      })
      if (error) throw error
      toast.success('Horario bloqueado')
      onClose()
    } catch {
      toast.error('Error al bloquear horario')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!bloqueo) return
    setLoading(true)
    try {
      const { error } = await supabase.from('bloqueos').delete().eq('id', bloqueo.id)
      if (error) throw error
      toast.success('Bloqueo eliminado')
      onClose()
    } catch {
      toast.error('Error al eliminar bloqueo')
    } finally {
      setLoading(false)
    }
  }

  const fechaLabel = format(fecha, "EEEE d 'de' MMMM", { locale: es })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Bloqueo existente' : 'Bloquear horario'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{profesionalNombre}</span>
            <span className="mx-1">—</span>
            <span className="capitalize">{fechaLabel}</span>
          </div>

          {!isEditing && (
            <>
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
                  placeholder="Ej: Turno médico, personal..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>

              <Button onClick={handleCreate} disabled={loading} className="w-full">
                {loading ? 'Bloqueando...' : 'Bloquear horario'}
              </Button>
            </>
          )}

          {isEditing && bloqueo && (
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
