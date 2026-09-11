'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profesional, Horario } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Pencil, Clock, CalendarDays, UserCog } from 'lucide-react'
import { DIAS_SEMANA } from '@/lib/constants'
import { toast } from 'sonner'
import { COLORES_DEFAULT, type AppUser } from '@/app/(dashboard)/configuracion/tipos'
interface Props {
  /** Usuarios de auth, para saber si el empleado ya tiene cuenta creada. */
  users: AppUser[]
  /** Se llama al crear o cambiar una cuenta, para que el padre recargue `users`. */
  onCuentaGuardada: () => void
}
/**
 * Tab "Empleados" de Configuracion: alta y edicion de profesionales, su
 * cuenta de acceso y sus horarios semanales.
 *
 * Vive aparte de la pagina porque no comparte estado con el tab General —
 * lo unico que necesita de afuera es la lista de usuarios de auth.
 */
export function TabEmpleados({ users, onCuentaGuardada }: Props) {
  const supabase = createClient()
  // Empleados state
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [empDialogOpen, setEmpDialogOpen] = useState(false)
  const [editingEmp, setEditingEmp] = useState<Profesional | null>(null)
  const [empForm, setEmpForm] = useState({ nombre: '', telefono: '', email: '', color: COLORES_DEFAULT[0], comision_porcentaje: 0, sueldo_fijo: 0 })
  const [empLoading, setEmpLoading] = useState(false)
  const [cuentaUsername, setCuentaUsername] = useState('')
  const [cuentaPassword, setCuentaPassword] = useState('')
  const [cuentaLoading, setCuentaLoading] = useState(false)

  // Horarios state
  const [horarioDialogOpen, setHorarioDialogOpen] = useState(false)
  const [selectedProfId, setSelectedProfId] = useState<string | null>(null)
  const [horarios, setHorarios] = useState<Horario[]>([])


  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('*').order('nombre')
    if (data) setProfesionales(data)
  }


  useEffect(() => {
    fetchProfesionales()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Empleados handlers ---
  function openNewEmpleado() {
    setEditingEmp(null)
    setEmpForm({
      nombre: '',
      telefono: '',
      email: '',
      color: COLORES_DEFAULT[profesionales.length % COLORES_DEFAULT.length],
      comision_porcentaje: 0,
      sueldo_fijo: 0,
    })
    setEmpDialogOpen(true)
  }

  function openEditEmpleado(prof: Profesional) {
    setEditingEmp(prof)
    setEmpForm({
      nombre: prof.nombre,
      telefono: prof.telefono || '',
      email: prof.email || '',
      color: prof.color,
      comision_porcentaje: prof.comision_porcentaje ?? 0,
      sueldo_fijo: prof.sueldo_fijo ?? 0,
    })
    // Pre-llenar username de cuenta
    const existingUser = prof.email
      ? (prof.email.endsWith('@estetica.local') ? prof.email.replace('@estetica.local', '') : prof.email)
      : prof.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')
    setCuentaUsername(existingUser)
    setCuentaPassword('')
    setEmpDialogOpen(true)
  }

  async function handleSaveEmpleado() {
    if (!empForm.nombre.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setEmpLoading(true)
    try {
      const nuevoSueldo = empForm.sueldo_fijo > 0 ? empForm.sueldo_fijo : null
      const payload = {
        nombre: empForm.nombre.trim(),
        telefono: empForm.telefono || null,
        email: empForm.email || null,
        color: empForm.color,
        comision_porcentaje: empForm.comision_porcentaje,
        sueldo_fijo: nuevoSueldo,
        updated_at: new Date().toISOString(),
      }

      let profId: string | null = null

      if (editingEmp) {
        const { error } = await supabase.from('profesionales').update(payload).eq('id', editingEmp.id)
        if (error) throw error
        profId = editingEmp.id
        toast.success('Empleado actualizado')
      } else {
        const { data, error } = await supabase.from('profesionales').insert(payload).select('id').single()
        if (error) throw error
        profId = data.id
        toast.success('Empleado creado')
      }

      // Si sueldo_fijo cambió, registrar en el historial (vigente desde el mes actual)
      const sueldoAnterior = editingEmp?.sueldo_fijo ?? null
      if (profId && nuevoSueldo !== sueldoAnterior) {
        const today = new Date()
        const vigente_desde = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
        await supabase.from('sueldos_fijos_historico').insert({
          profesional_id: profId,
          monto: nuevoSueldo ?? 0,
          vigente_desde,
        })
      }

      setEmpDialogOpen(false)
      fetchProfesionales()
    } catch {
      toast.error('Error al guardar empleado')
    } finally {
      setEmpLoading(false)
    }
  }

  async function handleSaveCuenta() {
    if (!editingEmp || !cuentaUsername || !cuentaPassword) {
      toast.error('Completá usuario y contraseña')
      return
    }
    if (cuentaPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    const authEmail = cuentaUsername.includes('@') ? cuentaUsername : `${cuentaUsername}@estetica.local`
    setCuentaLoading(true)
    try {
      const existingUser = users.find(u => u.email === authEmail)
      if (existingUser) {
        const res = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: existingUser.id, password: cuentaPassword }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: cuentaPassword }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      }
      // Vincular email al profesional
      await supabase.from('profesionales').update({ email: authEmail, updated_at: new Date().toISOString() }).eq('id', editingEmp.id)
      toast.success(users.find(u => u.email === authEmail) ? 'Contraseña actualizada' : 'Cuenta creada')
      setCuentaPassword('')
      fetchProfesionales()
      onCuentaGuardada()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar cuenta')
    } finally {
      setCuentaLoading(false)
    }
  }

  async function handleDeleteEmpleado(prof: Profesional) {
    if (!confirm(`¿Eliminar a "${prof.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('profesionales').delete().eq('id', prof.id)
    if (error) {
      toast.error('Error al eliminar: ' + error.message)
    } else {
      toast.success(`"${prof.nombre}" eliminado`)
      fetchProfesionales()
    }
  }

  async function toggleActivo(prof: Profesional) {
    const { error } = await supabase
      .from('profesionales')
      .update({ activo: !prof.activo, updated_at: new Date().toISOString() })
      .eq('id', prof.id)
    if (!error) {
      toast.success(prof.activo ? 'Empleado desactivado' : 'Empleado activado')
      fetchProfesionales()
    }
  }

  async function toggleVisibleCalendario(prof: Profesional) {
    const { error } = await supabase
      .from('profesionales')
      .update({ visible_calendario: !prof.visible_calendario, updated_at: new Date().toISOString() })
      .eq('id', prof.id)
    if (!error) {
      toast.success(prof.visible_calendario ? `${prof.nombre} oculto del calendario` : `${prof.nombre} visible en calendario`)
      fetchProfesionales()
    }
  }

  // --- Horarios handlers ---
  async function fetchHorarios(profId: string) {
    const { data } = await supabase.from('horarios').select('*').eq('profesional_id', profId).order('dia_semana')
    if (data) setHorarios(data)
  }

  function openHorarios(prof: Profesional) {
    setSelectedProfId(prof.id)
    fetchHorarios(prof.id)
    setHorarioDialogOpen(true)
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
    <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Empleados</CardTitle>
                  <CardDescription>Gestioná tu equipo y sus porcentajes de comisión</CardDescription>
                </div>
                <Button size="sm" className="gap-2" onClick={openNewEmpleado}>
                  <Plus className="h-4 w-4" />
                  Agregar empleado
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {profesionales.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay empleados registrados
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="text-center">Comisión %</TableHead>
                      <TableHead className="text-center">Sueldo fijo</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-center">
                        <span className="flex items-center justify-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />Calendario
                        </span>
                      </TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profesionales.map((prof) => (
                      <TableRow key={prof.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 rounded-full shrink-0"
                              style={{ backgroundColor: prof.color }}
                            />
                            <div>
                              <p className="font-medium">{prof.nombre}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {prof.telefono || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold">{prof.comision_porcentaje ?? 0}%</span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {prof.sueldo_fijo ? `$${prof.sueldo_fijo.toLocaleString('es-AR')}` : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={prof.activo ? 'default' : 'secondary'}
                            className="cursor-pointer"
                            onClick={() => toggleActivo(prof)}
                          >
                            {prof.activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={prof.visible_calendario ?? true}
                            onCheckedChange={() => toggleVisibleCalendario(prof)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditEmpleado(prof)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openHorarios(prof)}
                              title="Horarios"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteEmpleado(prof)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

      {/* Dialog horarios */}
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

      {/* Dialog crear/editar empleado */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmp ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={empForm.nombre}
                onChange={(e) => setEmpForm({ ...empForm, nombre: e.target.value })}
                placeholder="Nombre del empleado"
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={empForm.telefono}
                onChange={(e) => setEmpForm({ ...empForm, telefono: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORES_DEFAULT.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      empForm.color === color ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEmpForm({ ...empForm, color })}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Comisión sobre venta (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={empForm.comision_porcentaje}
                    onChange={(e) => setEmpForm({ ...empForm, comision_porcentaje: Number(e.target.value) || 0 })}
                  />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sueldo fijo mensual ($)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={empForm.sueldo_fijo}
                    onChange={(e) => setEmpForm({ ...empForm, sueldo_fijo: Number(e.target.value) || 0 })}
                    placeholder="0 = no aplica"
                  />
                </div>
              </div>
            </div>
            <Button onClick={handleSaveEmpleado} className="w-full" disabled={empLoading}>
              {empLoading ? 'Guardando...' : editingEmp ? 'Actualizar' : 'Crear empleado'}
            </Button>

            {/* Cuenta de acceso — solo al editar */}
            {editingEmp && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    Cuenta de acceso
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Usuario</Label>
                      <Input
                        type="text"
                        value={cuentaUsername}
                        onChange={(e) => setCuentaUsername(e.target.value)}
                        placeholder="nombre de usuario"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Contraseña</Label>
                      <Input
                        type="text"
                        value={cuentaPassword}
                        onChange={(e) => setCuentaPassword(e.target.value)}
                        placeholder="mín. 6 caracteres"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveCuenta}
                    disabled={cuentaLoading || !cuentaPassword}
                    className="w-full"
                  >
                    {cuentaLoading ? 'Guardando...' : users.find(u => u.email === (cuentaUsername.includes('@') ? cuentaUsername : `${cuentaUsername}@estetica.local`)) ? 'Cambiar contraseña' : 'Crear cuenta'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
