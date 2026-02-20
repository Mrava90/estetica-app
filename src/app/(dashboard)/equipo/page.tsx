'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { profesionalSchema, type ProfesionalInput } from '@/lib/validators'
import type { Profesional, Servicio, Horario } from '@/types/database'
import { DIAS_SEMANA } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Plus, Pencil, Clock } from 'lucide-react'

const COLORES_DEFAULT = ['#6366f1', '#ec4899', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6']

export default function EquipoPage() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [horarioDialogOpen, setHorarioDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProfId, setSelectedProfId] = useState<string | null>(null)
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [profServicios, setProfServicios] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProfesionalInput>({
    resolver: zodResolver(profesionalSchema),
  })

  useEffect(() => {
    fetchProfesionales()
    fetchServicios()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('*').order('nombre')
    if (data) setProfesionales(data)
  }

  async function fetchServicios() {
    const { data } = await supabase.from('servicios').select('*').eq('activo', true).order('nombre')
    if (data) setServicios(data)
  }

  async function fetchHorarios(profId: string) {
    const { data } = await supabase.from('horarios').select('*').eq('profesional_id', profId).order('dia_semana')
    if (data) setHorarios(data)
  }

  async function fetchProfServicios(profId: string) {
    const { data } = await supabase.from('profesional_servicios').select('servicio_id').eq('profesional_id', profId)
    if (data) setProfServicios(data.map((d) => d.servicio_id))
  }

  function openNew() {
    setEditingId(null)
    setProfServicios([])
    reset({ nombre: '', telefono: '', email: '', color: COLORES_DEFAULT[profesionales.length % COLORES_DEFAULT.length] })
    setDialogOpen(true)
  }

  function openEdit(prof: Profesional) {
    setEditingId(prof.id)
    reset({ nombre: prof.nombre, telefono: prof.telefono || '', email: prof.email || '', color: prof.color })
    fetchProfServicios(prof.id)
    setDialogOpen(true)
  }

  function openHorarios(prof: Profesional) {
    setSelectedProfId(prof.id)
    fetchHorarios(prof.id)
    setHorarioDialogOpen(true)
  }

  async function onSubmit(data: ProfesionalInput) {
    setLoading(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('profesionales')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', editingId)
        if (error) throw error

        // Update services
        await supabase.from('profesional_servicios').delete().eq('profesional_id', editingId)
        if (profServicios.length > 0) {
          await supabase.from('profesional_servicios').insert(
            profServicios.map((sid) => ({ profesional_id: editingId, servicio_id: sid }))
          )
        }
        toast.success('Profesional actualizado')
      } else {
        const { data: newProf, error } = await supabase.from('profesionales').insert(data).select().single()
        if (error) throw error

        if (profServicios.length > 0) {
          await supabase.from('profesional_servicios').insert(
            profServicios.map((sid) => ({ profesional_id: newProf.id, servicio_id: sid }))
          )
        }
        toast.success('Profesional creado')
      }
      setDialogOpen(false)
      fetchProfesionales()
    } catch {
      toast.error('Error al guardar profesional')
    } finally {
      setLoading(false)
    }
  }

  async function toggleActivo(prof: Profesional) {
    const { error } = await supabase
      .from('profesionales')
      .update({ activo: !prof.activo, updated_at: new Date().toISOString() })
      .eq('id', prof.id)
    if (!error) {
      toast.success(prof.activo ? 'Profesional desactivado' : 'Profesional activado')
      fetchProfesionales()
    }
  }

  function toggleServicio(servicioId: string) {
    setProfServicios((prev) =>
      prev.includes(servicioId) ? prev.filter((s) => s !== servicioId) : [...prev, servicioId]
    )
  }

  async function saveHorario(diaSemana: number, horaInicio: string, horaFin: string) {
    if (!selectedProfId) return
    try {
      const existing = horarios.find((h) => h.dia_semana === diaSemana)
      if (existing) {
        await supabase.from('horarios').update({ hora_inicio: horaInicio, hora_fin: horaFin, activo: true }).eq('id', existing.id)
      } else {
        await supabase.from('horarios').insert({
          profesional_id: selectedProfId,
          dia_semana: diaSemana,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
        })
      }
      toast.success('Horario guardado')
      fetchHorarios(selectedProfId)
    } catch {
      toast.error('Error al guardar horario')
    }
  }

  async function removeHorario(diaSemana: number) {
    if (!selectedProfId) return
    const existing = horarios.find((h) => h.dia_semana === diaSemana)
    if (existing) {
      await supabase.from('horarios').update({ activo: false }).eq('id', existing.id)
      toast.success('Día libre configurado')
      fetchHorarios(selectedProfId)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipo</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo profesional
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profesionales.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8">
            No hay profesionales. Creá el primero.
          </p>
        )}
        {profesionales.map((prof) => (
          <Card key={prof.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full" style={{ backgroundColor: prof.color }} />
                  <div>
                    <CardTitle className="text-base">{prof.nombre}</CardTitle>
                    {prof.telefono && <p className="text-xs text-muted-foreground">{prof.telefono}</p>}
                  </div>
                </div>
                <Badge
                  variant={prof.activo ? 'default' : 'secondary'}
                  className="cursor-pointer"
                  onClick={() => toggleActivo(prof)}
                >
                  {prof.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(prof)} className="gap-1">
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => openHorarios(prof)} className="gap-1">
                <Clock className="h-3 w-3" />
                Horarios
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog for creating/editing professional */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar profesional' : 'Nuevo profesional'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input {...register('nombre')} />
              {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input {...register('telefono')} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORES_DEFAULT.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      watch('color') === color ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setValue('color', color)}
                  />
                ))}
              </div>
            </div>
            {servicios.length > 0 && (
              <div className="space-y-2">
                <Label>Servicios que ofrece</Label>
                <div className="flex flex-wrap gap-2">
                  {servicios.map((s) => (
                    <Badge
                      key={s.id}
                      variant={profServicios.includes(s.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleServicio(s.id)}
                    >
                      {s.nombre}
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

      {/* Dialog for schedule management */}
      <Dialog open={horarioDialogOpen} onOpenChange={setHorarioDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Horarios - {profesionales.find((p) => p.id === selectedProfId)?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
              const horario = horarios.find((h) => h.dia_semana === dia && h.activo)
              return (
                <div key={dia} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium">{DIAS_SEMANA[dia]}</span>
                  {horario ? (
                    <>
                      <Input
                        type="time"
                        className="w-28"
                        defaultValue={horario.hora_inicio}
                        onBlur={(e) => saveHorario(dia, e.target.value, horario.hora_fin)}
                      />
                      <span className="text-muted-foreground">a</span>
                      <Input
                        type="time"
                        className="w-28"
                        defaultValue={horario.hora_fin}
                        onBlur={(e) => saveHorario(dia, horario.hora_inicio, e.target.value)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeHorario(dia)} className="text-destructive text-xs">
                        Libre
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground flex-1">Libre</span>
                      <Button variant="outline" size="sm" onClick={() => saveHorario(dia, '09:00', '18:00')}>
                        Agregar
                      </Button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
