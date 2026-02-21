'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { servicioSchema, type ServicioInput } from '@/lib/validators'
import type { Servicio } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Pencil, Banknote, Smartphone } from 'lucide-react'

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServicioInput>({
    resolver: zodResolver(servicioSchema),
  })

  useEffect(() => {
    fetchServicios()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchServicios() {
    const { data } = await supabase.from('servicios').select('*').order('nombre')
    if (data) setServicios(data)
  }

  function openNew() {
    setEditingId(null)
    reset({ nombre: '', descripcion: '', duracion_minutos: 30, precio_efectivo: 0, precio_mercadopago: 0 })
    setDialogOpen(true)
  }

  function openEdit(servicio: Servicio) {
    setEditingId(servicio.id)
    reset({
      nombre: servicio.nombre,
      descripcion: servicio.descripcion || '',
      duracion_minutos: servicio.duracion_minutos,
      precio_efectivo: servicio.precio_efectivo,
      precio_mercadopago: servicio.precio_mercadopago,
    })
    setDialogOpen(true)
  }

  async function onSubmit(data: ServicioInput) {
    setLoading(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('servicios')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', editingId)
        if (error) throw error
        toast.success('Servicio actualizado')
      } else {
        const { error } = await supabase.from('servicios').insert(data)
        if (error) throw error
        toast.success('Servicio creado')
      }
      setDialogOpen(false)
      fetchServicios()
    } catch {
      toast.error('Error al guardar servicio')
    } finally {
      setLoading(false)
    }
  }

  async function toggleActivo(servicio: Servicio) {
    const { error } = await supabase
      .from('servicios')
      .update({ activo: !servicio.activo, updated_at: new Date().toISOString() })
      .eq('id', servicio.id)
    if (error) {
      toast.error('Error al cambiar estado')
    } else {
      toast.success(servicio.activo ? 'Servicio desactivado' : 'Servicio activado')
      fetchServicios()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Servicios</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Efectivo</TableHead>
                <TableHead>P. Lista</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay servicios creados. Creá el primero.
                  </TableCell>
                </TableRow>
              )}
              {servicios.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <div>
                      {s.nombre}
                      {s.descripcion && (
                        <p className="text-xs text-muted-foreground">{s.descripcion}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{s.duracion_minutos} min</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3 w-3 text-green-600" />
                      {formatPrecio(s.precio_efectivo)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Smartphone className="h-3 w-3 text-blue-600" />
                      {formatPrecio(s.precio_mercadopago)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.activo ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActivo(s)}
                    >
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: Corte de cabello" {...register('nombre')} />
              {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea placeholder="Descripción del servicio..." {...register('descripcion')} />
            </div>
            <div className="space-y-2">
              <Label>Duración (minutos)</Label>
              <Input type="number" {...register('duracion_minutos', { valueAsNumber: true })} />
              {errors.duracion_minutos && (
                <p className="text-sm text-destructive">{errors.duracion_minutos.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Banknote className="h-3.5 w-3.5 text-green-600" />
                  Precio efectivo
                </Label>
                <Input type="number" step="0.01" {...register('precio_efectivo', { valueAsNumber: true })} />
                {errors.precio_efectivo && <p className="text-sm text-destructive">{errors.precio_efectivo.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5 text-blue-600" />
                  Precio de Lista
                </Label>
                <Input type="number" step="0.01" {...register('precio_mercadopago', { valueAsNumber: true })} />
                {errors.precio_mercadopago && <p className="text-sm text-destructive">{errors.precio_mercadopago.message}</p>}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
