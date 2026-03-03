'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Phone, Banknote, Smartphone, Building2, Check } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [precioCustom, setPrecioCustom] = useState<number | null>(null)
  const [showPrecioEdit, setShowPrecioEdit] = useState(false)
  const [showNewCliente, setShowNewCliente] = useState(false)
  const [newClienteNombre, setNewClienteNombre] = useState('')
  const [newClienteTelefono, setNewClienteTelefono] = useState('')

  // Combobox states — cliente
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const [clienteLabel, setClienteLabel] = useState('')
  const clienteRef = useRef<HTMLDivElement>(null)

  // Combobox states — servicio
  const [servicioQuery, setServicioQuery] = useState('')
  const [servicioOpen, setServicioOpen] = useState(false)
  const [servicioLabel, setServicioLabel] = useState('')
  const servicioRef = useRef<HTMLDivElement>(null)

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

  const filteredProfesionales = selectedServicioId && profServMap[selectedServicioId]
    ? profesionales.filter((p) => profServMap[selectedServicioId].includes(p.id))
    : profesionales

  // Filter servicios locally as the user types
  const filteredServicios = servicioQuery
    ? servicios.filter((s) => s.nombre.toLowerCase().includes(servicioQuery.toLowerCase()))
    : servicios

  useEffect(() => {
    if (open) {
      fetchServicios()
      fetchProfServMap()
      fetchClientes('')
      setPrecioCustom(null)
      setShowPrecioEdit(false)
      setShowNewCliente(false)
      setNewClienteNombre('')
      setNewClienteTelefono('')

      if (cita) {
        const servPrecio = servicios.find((s) => s.id === cita.servicio_id)
        const expectedPrecio = cita.metodo_pago === 'mercadopago' ? servPrecio?.precio_mercadopago : servPrecio?.precio_efectivo
        if (cita.precio_cobrado != null && expectedPrecio != null && cita.precio_cobrado !== expectedPrecio) {
          setPrecioCustom(cita.precio_cobrado)
          setShowPrecioEdit(true)
        }
        setClienteLabel(cita.clientes ? `${cita.clientes.nombre} — ${cita.clientes.telefono}` : '')
        setServicioLabel(cita.servicios ? `${cita.servicios.nombre} (${cita.servicios.duracion_minutos} min)` : '')
        reset({
          cliente_id: cita.cliente_id || '',
          profesional_id: cita.profesional_id || '',
          servicio_id: cita.servicio_id || '',
          fecha_inicio: cita.fecha_inicio,
          metodo_pago: (cita.metodo_pago as 'efectivo' | 'mercadopago' | 'transferencia') || 'efectivo',
          notas: cita.notas || '',
        })
      } else if (selectedDate) {
        const d = selectedDate.start
        const localISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        setClienteLabel('')
        setServicioLabel('')
        reset({
          cliente_id: '',
          profesional_id: selectedProfesionalId || '',
          servicio_id: '',
          fecha_inicio: localISO,
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

  function selectCliente(c: Cliente) {
    setValue('cliente_id', c.id)
    setClienteLabel(`${c.nombre} — ${c.telefono}`)
    setClienteQuery('')
    setClienteOpen(false)
  }

  function selectServicio(s: Servicio) {
    setValue('servicio_id', s.id)
    setServicioLabel(`${s.nombre} (${s.duracion_minutos} min)`)
    setServicioQuery('')
    setServicioOpen(false)
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
      const precioBase = getPrecioServicio(servicio, data.metodo_pago)
      const precio = precioCustom !== null ? precioCustom : precioBase

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
          precio_cobrado: precioCustom !== null ? precioCustom : precioBase,
          origen: 'manual',
        })

        if (error) throw error
        toast.success('Cita creada')
      }
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message
      toast.error(msg || 'Error al guardar la cita')
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
      selectCliente(data)
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

  const clienteIdValue = watch('cliente_id')
  const servicioIdValue = watch('servicio_id')

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

          {/* ── Cliente combobox ── */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            {!showNewCliente ? (
              <>
                <div ref={clienteRef} className="relative">
                  <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Buscar por nombre o teléfono..."
                    value={clienteOpen ? clienteQuery : clienteLabel}
                    onChange={(e) => {
                      setClienteQuery(e.target.value)
                      fetchClientes(e.target.value)
                    }}
                    onFocus={() => {
                      setClienteQuery('')
                      setClienteOpen(true)
                      fetchClientes('')
                    }}
                    onBlur={() => setTimeout(() => setClienteOpen(false), 150)}
                  />
                  {clienteOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
                      {clientes.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                      )}
                      {clientes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                          onMouseDown={(e) => { e.preventDefault(); selectCliente(c) }}
                        >
                          {c.id === clienteIdValue && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          <span className={c.id === clienteIdValue ? 'font-medium' : ''}>
                            {c.nombre}
                          </span>
                          <span className="text-muted-foreground ml-auto shrink-0">{c.telefono}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0 h-auto"
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
                  <Button type="button" size="sm" onClick={handleCreateCliente}>Crear</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCliente(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {errors.cliente_id && (
              <p className="text-sm text-destructive">{errors.cliente_id.message}</p>
            )}
          </div>

          {/* ── Profesional ── */}
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

          {/* ── Servicio combobox ── */}
          <div className="space-y-2">
            <Label>Servicio</Label>
            <div ref={servicioRef} className="relative">
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Buscar servicio..."
                value={servicioOpen ? servicioQuery : servicioLabel}
                onChange={(e) => setServicioQuery(e.target.value)}
                onFocus={() => {
                  setServicioQuery('')
                  setServicioOpen(true)
                }}
                onBlur={() => setTimeout(() => setServicioOpen(false), 150)}
              />
              {servicioOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg">
                  {filteredServicios.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                  )}
                  {filteredServicios.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                      onMouseDown={(e) => { e.preventDefault(); selectServicio(s) }}
                    >
                      {s.id === servicioIdValue && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <span className={s.id === servicioIdValue ? 'font-medium' : ''}>{s.nombre}</span>
                      <span className="text-muted-foreground ml-auto shrink-0 text-xs">{s.duracion_minutos} min</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {errors.servicio_id && (
              <p className="text-sm text-destructive">{errors.servicio_id.message}</p>
            )}
            {selectedServicio && (
              <p className="text-xs text-muted-foreground">
                Efectivo: {formatPrecio(selectedServicio.precio_efectivo)} |
                Mercadopago: {formatPrecio(selectedServicio.precio_mercadopago)}
              </p>
            )}
          </div>

          {/* ── Método de pago ── */}
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

          {/* ── Precio custom ── */}
          {selectedServicio && (
            <div className="flex items-center gap-2">
              {!showPrecioEdit ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0 h-auto text-xs text-muted-foreground"
                  onClick={() => {
                    setShowPrecioEdit(true)
                    setPrecioCustom(getPrecioServicio(selectedServicio, selectedMetodoPago) || 0)
                  }}
                >
                  Editar precio
                </Button>
              ) : (
                <>
                  <Label className="text-xs shrink-0">Precio:</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={precioCustom ?? ''}
                    onChange={(e) => setPrecioCustom(Number(e.target.value))}
                    className="h-7 w-28 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => { setShowPrecioEdit(false); setPrecioCustom(null) }}
                  >
                    Resetear
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Fecha/Hora ── */}
          <div className="space-y-2">
            <Label>Fecha y hora</Label>
            <Input type="datetime-local" {...register('fecha_inicio')} />
            {errors.fecha_inicio && (
              <p className="text-sm text-destructive">{errors.fecha_inicio.message}</p>
            )}
          </div>

          {/* ── Notas ── */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea placeholder="Notas adicionales..." {...register('notas')} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear cita'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>

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
