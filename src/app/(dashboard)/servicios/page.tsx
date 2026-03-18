'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { servicioSchema, type ServicioInput } from '@/lib/validators'
import type { Servicio, Profesional } from '@/types/database'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Pencil, Banknote, Smartphone, Upload, Download, Tag, TrendingUp, ArrowRight, X, Search } from 'lucide-react'

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedProfs, setSelectedProfs] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [aumentoDialogOpen, setAumentoDialogOpen] = useState(false)
  const [porcentaje, setPorcentaje] = useState<string>('15')
  const [applying, setApplying] = useState(false)
  const supabase = createClient()

  const [busqueda, setBusqueda] = useState('')

  const pct = parseFloat(porcentaje) || 0
  const aplicarAumento = (precio: number) => Math.round(precio * (1 + pct / 100))
  const serviciosActivos = servicios.filter((s) => s.activo)
  const serviciosFiltrados = busqueda.trim()
    ? servicios.filter((s) => s.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))
    : servicios

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServicioInput>({
    resolver: zodResolver(servicioSchema),
  })

  const esPromoValue = watch('es_promo')

  useEffect(() => {
    fetchServicios()
    fetchProfesionales()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchServicios() {
    const { data } = await supabase.from('servicios').select('*').order('nombre')
    if (data) setServicios(data)
  }

  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
    if (data) setProfesionales(data)
  }

  async function fetchProfServicio(servicioId: string) {
    const { data } = await supabase
      .from('profesional_servicios')
      .select('profesional_id')
      .eq('servicio_id', servicioId)
    if (data && data.length > 0) {
      setSelectedProfs(data.map((d) => d.profesional_id))
    } else {
      // If no records, default all checked
      setSelectedProfs(profesionales.map((p) => p.id))
    }
  }

  function openNew() {
    setEditingId(null)
    reset({ nombre: '', descripcion: '', duracion_minutos: 30, precio_efectivo: 0, precio_mercadopago: 0, es_promo: false })
    setSelectedProfs(profesionales.map((p) => p.id))
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
      es_promo: servicio.es_promo ?? false,
    })
    fetchProfServicio(servicio.id)
    setDialogOpen(true)
  }

  function toggleProf(profId: string) {
    setSelectedProfs((prev) =>
      prev.includes(profId) ? prev.filter((id) => id !== profId) : [...prev, profId]
    )
  }

  async function onSubmit(data: ServicioInput) {
    setLoading(true)
    try {
      let servicioId = editingId

      if (editingId) {
        const { error } = await supabase
          .from('servicios')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { data: newServ, error } = await supabase
          .from('servicios')
          .insert(data)
          .select('id')
          .single()
        if (error) throw error
        servicioId = newServ.id
      }

      // Update profesional_servicios
      if (servicioId) {
        await supabase.from('profesional_servicios').delete().eq('servicio_id', servicioId)
        if (selectedProfs.length > 0) {
          await supabase.from('profesional_servicios').insert(
            selectedProfs.map((profId) => ({ profesional_id: profId, servicio_id: servicioId }))
          )
        }
      }

      toast.success(editingId ? 'Servicio actualizado' : 'Servicio creado')
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

  async function handleEliminar(servicio: Servicio) {
    if (!confirm(`¿Eliminar "${servicio.nombre}" permanentemente? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('servicios').delete().eq('id', servicio.id)
    if (error) {
      toast.error('Error al eliminar el servicio')
    } else {
      toast.success('Servicio eliminado')
      fetchServicios()
    }
  }

  async function handleDownload() {
    const a = document.createElement('a')
    a.href = '/api/servicios'
    a.download = 'Servicios.xlsx'
    a.click()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/servicios', { method: 'POST', body: form })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error || 'Error al subir archivo')
        return
      }
      const msgs: string[] = []
      if (result.created > 0) msgs.push(`${result.created} creados`)
      if (result.updated > 0) msgs.push(`${result.updated} actualizados`)
      if (result.skipped > 0) msgs.push(`${result.skipped} omitidos`)
      toast.success(msgs.join(', ') || 'Sin cambios')
      if (result.errors?.length > 0) {
        result.errors.forEach((err: string) => toast.error(err))
      }
      fetchServicios()
    } catch {
      toast.error('Error al procesar archivo')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleAplicarAumento() {
    if (pct <= 0 || serviciosActivos.length === 0) return
    setApplying(true)
    let ok = 0
    for (const s of serviciosActivos) {
      const { error } = await supabase
        .from('servicios')
        .update({
          precio_efectivo: aplicarAumento(s.precio_efectivo),
          precio_mercadopago: aplicarAumento(s.precio_mercadopago),
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id)
      if (!error) ok++
    }
    setApplying(false)
    setAumentoDialogOpen(false)
    setPorcentaje('15')
    toast.success(`Precios actualizados en ${ok} servicio(s)`)
    fetchServicios()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Servicios</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAumentoDialogOpen(true)} className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Aumentar %</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Descargar</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 relative" disabled={uploading} asChild>
            <label>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">{uploading ? 'Subiendo...' : 'Subir Excel'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo servicio</span>
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar servicio..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-8"
        />
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
              {serviciosFiltrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay servicios creados. Creá el primero.'}
                  </TableCell>
                </TableRow>
              )}
              {serviciosFiltrados.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {s.nombre}
                        {s.es_promo && (
                          <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300">
                            <Tag className="h-2.5 w-2.5" />
                            PROMO
                          </Badge>
                        )}
                      </div>
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
                    <Button variant="ghost" size="icon" onClick={() => handleEliminar(s)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
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

            {/* Promo toggle */}
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                id="es_promo"
                checked={!!esPromoValue}
                onCheckedChange={(v) => setValue('es_promo', !!v)}
              />
              <div>
                <Label htmlFor="es_promo" className="cursor-pointer flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-600" />
                  Es una promo
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Aparecerá en el filtro "Promos" del sistema de reservas</p>
              </div>
            </div>

            {/* Profesionales que realizan este servicio */}
            {profesionales.length > 0 && (
              <div className="space-y-2">
                <Label>Profesionales que lo realizan</Label>
                <div className="flex flex-wrap gap-2">
                  {profesionales.map((p) => (
                    <Badge
                      key={p.id}
                      variant={selectedProfs.includes(p.id) ? 'default' : 'outline'}
                      className="cursor-pointer gap-1.5"
                      onClick={() => toggleProf(p.id)}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.nombre}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog aumento por porcentaje ── */}
      <Dialog open={aumentoDialogOpen} onOpenChange={(o) => { setAumentoDialogOpen(o); if (!o) setPorcentaje('15') }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Aumentar precios por porcentaje
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Input porcentaje */}
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Porcentaje de aumento</Label>
              <div className="relative w-32">
                <Input
                  type="number"
                  min="0.1"
                  max="500"
                  step="0.5"
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              {pct > 0 && (
                <span className="text-sm text-muted-foreground">
                  Afecta {serviciosActivos.length} servicio(s) activo(s)
                </span>
              )}
            </div>

            {/* Tabla preview */}
            {pct > 0 && serviciosActivos.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-md border text-xs">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-1">
                          <Banknote className="h-3 w-3 text-green-600" />
                          Efectivo
                        </span>
                      </TableHead>
                      <TableHead className="w-4"></TableHead>
                      <TableHead className="text-right font-semibold text-foreground">Nuevo</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-1">
                          <Smartphone className="h-3 w-3 text-blue-600" />
                          P. Lista
                        </span>
                      </TableHead>
                      <TableHead className="w-4"></TableHead>
                      <TableHead className="text-right font-semibold text-foreground">Nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviciosActivos.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nombre}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatPrecio(s.precio_efectivo)}</TableCell>
                        <TableCell className="px-0 text-muted-foreground"><ArrowRight className="h-3 w-3" /></TableCell>
                        <TableCell className="text-right font-semibold text-green-700 dark:text-green-400">
                          {formatPrecio(aplicarAumento(s.precio_efectivo))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatPrecio(s.precio_mercadopago)}</TableCell>
                        <TableCell className="px-0 text-muted-foreground"><ArrowRight className="h-3 w-3" /></TableCell>
                        <TableCell className="text-right font-semibold text-blue-700 dark:text-blue-400">
                          {formatPrecio(aplicarAumento(s.precio_mercadopago))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAumentoDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleAplicarAumento}
                disabled={applying || pct <= 0 || serviciosActivos.length === 0}
                className="gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                {applying ? 'Aplicando...' : `Aplicar +${pct}% a ${serviciosActivos.length} servicio(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
