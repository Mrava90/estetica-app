'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { citaSchema, type CitaInput } from '@/lib/validators'
import type { CitaConRelaciones, Profesional, Servicio, Cliente, AppointmentStatus } from '@/types/database'
import { formatFechaHora, formatPrecio, addMinutes } from '@/lib/dates'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Phone, Banknote, Smartphone, Building2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  cita: CitaConRelaciones | null
  selectedDate: { start: Date; end: Date } | null
  selectedProfesionalId?: string | null
  profesionales: Profesional[]
}

export function CitaDialog({ open, onClose, cita, selectedDate, selectedProfesionalId, profesionales }: Props) {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [profServMap, setProfServMap] = useState<Record<string, string[]>>({})
  const [clienteSearch, setClienteSearch] = useState('')
  const [showNewCliente, setShowNewCliente] = useState(false)
  const [newClienteNombre, setNewClienteNombre] = useState('')
  const [newClienteTelefono, setNewClienteTelefono] = useState('')
  const [loading, setLoading] = useState(false)
  const isEditing = !!cita

  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CitaInput>({
    resolver: zodResolver(citaSchema),
  })

  const selectedServicioId = watch('servicio_id')
  const selectedMetodoPago = watch('metodo_pago') || 'efectivo'
  const selectedServicio = servicios.find((s) => s.id === selectedServicioId)

  // Filter professionals by selected service
  const filteredProfesionales = selectedServicioId && profServMap[selectedServicioId]
    ? profesionales.filter((p) => profServMap[selectedServicioId].includes(p.id))
    : profesionales

  useEffect(() => {
    if (open) {
      fetchServicios()
      fetchProfServMap()
      fetchClientes('')
      if (cita) {
        reset({
          cliente_id: cita.cliente_id || '',
          profesional_id: cita.profesional_id || '',
          servicio_id: cita.servicio_id || '',
          fecha_inicio: cita.fecha_inicio,
          metodo_pago: (cita.metodo_pago as 'efectivo' | 'mercadopago' | 'transferencia') || 'efectivo',
          notas: cita.notas || '',
        })
      } else if (selectedDate) {
        reset({
          cliente_id: '',
          profesional_id: selectedProfesionalId || '',
          servicio_id: '',
          fecha_inicio: selectedDate.start.toISOString(),
          metodo_pago: 'efectivo',
          notas: '',
        })
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchServicios() {
    const { data } = await supabase.from('servicios').select('*').eq('activo', true).order('nombre')
    if (data) setServicios(data)
  }

  async function fetchProfServMap() {
    const { data } = await supabase.from('profesional_servicios').select('profesional_id, servicio_id')
    if (data) {
      const map: Record<string, string[]> = {}
      for (const row of data) {
        if (!map[row.servicio_id]) map[row.servicio_id] = []
        map[row.servicio_id].push(row.profesional_id)
      }
      setProfServMap(map)
    }
  }

  async function fetchClientes(search: string) {
    let query = supabase.from('clientes').select('*').order('nombre').limit(20)
    if (search) {
      query = query.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%`)
    }
    const { data } = await query
    if (data) setClientes(data)
  }

  function getPrecioServicio(servicio: Servicio | undefined, metodo: string): number | null {
    if (!servicio) return null
    if (metodo === 'mercadopago') return servicio.precio_mercadopago
    return servicio.precio_efectivo
  }

  async function onSubmit(data: CitaInput) {
    setLoading(true)
    try {
      const servicio = servicios.find((s) => s.id === data.servicio_id)
      const fechaInicio = new Date(data.fecha_inicio)
      const fechaFin = addMinutes(fechaInicio, servicio?.duracion_minutos || 30)
      const precio = getPrecioServicio(servicio, data.metodo_pago)

      // Check for conflicts
      const { data: conflictos } = await supabase
        .from('citas')
        .select('id')
        .eq('profesional_id', data.profesional_id)
        .in('status', ['pendiente', 'confirmada'])
        .lt('fecha_inicio', fechaFin.toISOString())
        .gt('fecha_fin', fechaInicio.toISOString())
        .neq('id', cita?.id || '00000000-0000-0000-0000-000000000000')

      if (conflictos && conflictos.length > 0) {
        toast.error('El profesional ya tiene una cita en ese horario')
        setLoading(false)
        return
      }

      if (isEditing) {
        const { error } = await supabase
          .from('citas')
          .update({
            cliente_id: data.cliente_id,
            profesional_id: data.profesional_id,
            servicio_id: data.servicio_id,
            fecha_inicio: fechaInicio.toISOString(),
            fecha_fin: fechaFin.toISOString(),
            metodo_pago: data.metodo_pago,
            notas: data.notas || null,
            precio_cobrado: precio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cita!.id)

        if (error) throw error
        toast.success('Cita actualizada')
      } else {
        const { error } = await supabase.from('citas').insert({
          cliente_id: data.cliente_id,
          profesional_id: data.profesional_id,
          servicio_id: data.servicio_id,
          fecha_inicio: fechaInicio.toISOString(),
          fecha_fin: fechaFin.toISOString(),
          metodo_pago: data.metodo_pago,
          notas: data.notas || null,
          precio_cobrado: precio,
          origen: 'manual',
        })

        if (error) throw error
        toast.success('Cita creada')
      }
      onClose()
    } catch {
      toast.error('Error al guardar la cita')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(newStatus: AppointmentStatus) {
    if (!cita) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('citas')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', cita.id)
      if (error) throw error
      toast.success(`Cita marcada como ${STATUS_LABELS[newStatus].toLowerCase()}`)
      onClose()
    } catch {
      toast.error('Error al cambiar estado')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateCliente() {
    if (!newClienteNombre || !newClienteTelefono) {
      toast.error('Completá nombre y teléfono')
      return
    }
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ nombre: newClienteNombre, telefono: newClienteTelefono })
        .select()
        .single()
      if (error) throw error
      setValue('cliente_id', data.id)
      setClientes((prev) => [data, ...prev])
      setShowNewCliente(false)
      setNewClienteNombre('')
      setNewClienteTelefono('')
      toast.success('Cliente creado')
    } catch {
      toast.error('Error al crear cliente (el teléfono puede estar duplicado)')
    }
  }

  function generarWhatsAppLink() {
    if (!cita?.clientes?.telefono) return
    const tel = cita.clientes.telefono.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Hola ${cita.clientes.nombre}, te recordamos tu cita para ${cita.servicios?.nombre || 'tu servicio'} el ${formatFechaHora(cita.fecha_inicio)}. ¡Te esperamos!`
    )
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar cita' : 'Nueva cita'}</DialogTitle>
        </DialogHeader>

        {isEditing && cita && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={STATUS_COLORS[cita.status]}>{STATUS_LABELS[cita.status]}</Badge>
            {cita.metodo_pago === 'mercadopago' ? (
              <Badge variant="outline" className="gap-1"><Smartphone className="h-3 w-3" />Mercadopago</Badge>
            ) : cita.metodo_pago === 'transferencia' ? (
              <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />Transferencia</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><Banknote className="h-3 w-3" />Efectivo</Badge>
            )}
            {cita.clientes?.telefono && (
              <Button variant="outline" size="sm" onClick={generarWhatsAppLink} className="gap-1">
                <Phone className="h-3 w-3" />
                WhatsApp
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            {!showNewCliente ? (
              <>
                <Input
                  placeholder="Buscar por nombre o teléfono..."
                  value={clienteSearch}
                  onChange={(e) => {
                    setClienteSearch(e.target.value)
                    fetchClientes(e.target.value)
                  }}
                />
                <Select
                  value={watch('cliente_id')}
                  onValueChange={(v) => setValue('cliente_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} - {c.telefono}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() => setShowNewCliente(true)}
                >
                  + Nuevo cliente
                </Button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border p-3">
                <Input
                  placeholder="Nombre"
                  value={newClienteNombre}
                  onChange={(e) => setNewClienteNombre(e.target.value)}
                />
                <Input
                  placeholder="Teléfono (ej: 5491112345678)"
                  value={newClienteTelefono}
                  onChange={(e) => setNewClienteTelefono(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreateCliente}>
                    Crear
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewCliente(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {errors.cliente_id && (
              <p className="text-sm text-destructive">{errors.cliente_id.message}</p>
            )}
          </div>

          {/* Profesional */}
          <div className="space-y-2">
            <Label>Profesional</Label>
            <Select
              value={watch('profesional_id')}
              onValueChange={(v) => setValue('profesional_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar profesional" />
              </SelectTrigger>
              <SelectContent>
                {filteredProfesionales.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.nombre}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.profesional_id && (
              <p className="text-sm text-destructive">{errors.profesional_id.message}</p>
            )}
          </div>

          {/* Servicio */}
          <div className="space-y-2">
            <Label>Servicio</Label>
            <Select
              value={watch('servicio_id')}
              onValueChange={(v) => setValue('servicio_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar servicio" />
              </SelectTrigger>
              <SelectContent>
                {servicios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre} ({s.duracion_minutos} min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.servicio_id && (
              <p className="text-sm text-destructive">{errors.servicio_id.message}</p>
            )}
            {selectedServicio && (
              <p className="text-xs text-muted-foreground">
                Duración: {selectedServicio.duracion_minutos} min |
                Efectivo: {formatPrecio(selectedServicio.precio_efectivo)} |
                Mercadopago: {formatPrecio(selectedServicio.precio_mercadopago)}
              </p>
            )}
          </div>

          {/* Metodo de pago */}
          <div className="space-y-2">
            <Label>Método de pago</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={selectedMetodoPago === 'efectivo' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setValue('metodo_pago', 'efectivo')}
              >
                <Banknote className="h-4 w-4" />
                Efectivo
                {selectedServicio && (
                  <span className="text-xs opacity-80">({formatPrecio(selectedServicio.precio_efectivo)})</span>
                )}
              </Button>
              <Button
                type="button"
                variant={selectedMetodoPago === 'mercadopago' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setValue('metodo_pago', 'mercadopago')}
              >
                <Smartphone className="h-4 w-4" />
                MP
                {selectedServicio && (
                  <span className="text-xs opacity-80">({formatPrecio(selectedServicio.precio_mercadopago)})</span>
                )}
              </Button>
              <Button
                type="button"
                variant={selectedMetodoPago === 'transferencia' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setValue('metodo_pago', 'transferencia')}
              >
                <Building2 className="h-4 w-4" />
                Transf.
                {selectedServicio && (
                  <span className="text-xs opacity-80">({formatPrecio(selectedServicio.precio_efectivo)})</span>
                )}
              </Button>
            </div>
          </div>

          {/* Fecha/Hora */}
          <div className="space-y-2">
            <Label>Fecha y hora</Label>
            <Input
              type="datetime-local"
              {...register('fecha_inicio')}
            />
            {errors.fecha_inicio && (
              <p className="text-sm text-destructive">{errors.fecha_inicio.message}</p>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea placeholder="Notas adicionales..." {...register('notas')} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear cita'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>

        {/* Status change buttons for existing appointments */}
        {isEditing && cita && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cambiar estado</Label>
              <div className="flex flex-wrap gap-2">
                {cita.status !== 'confirmada' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('confirmada')} disabled={loading}>
                    Confirmar
                  </Button>
                )}
                {cita.status !== 'completada' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('completada')} disabled={loading}>
                    Completar
                  </Button>
                )}
                {cita.status !== 'cancelada' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('cancelada')} disabled={loading} className="text-destructive">
                    Cancelar
                  </Button>
                )}
                {cita.status !== 'no_asistio' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('no_asistio')} disabled={loading}>
                    No asistió
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
