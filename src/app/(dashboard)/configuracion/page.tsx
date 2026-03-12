'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Configuracion, Profesional, Horario } from '@/types/database'
import { formatFechaCorta } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Copy, Check, Plus, Trash2, Shield, KeyRound, Pencil, Users, Clock, CalendarDays, Menu, DatabaseBackup, UserCog, AtSign } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { NAV_ITEMS, DIAS_SEMANA, isAdminEmail } from '@/lib/constants'
const COLORES_DEFAULT = ['#6366f1', '#ec4899', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6']

interface AppUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_admin?: boolean
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Configuracion | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [users, setUsers] = useState<AppUser[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
  const [showNewUser, setShowNewUser] = useState(false)
  const [changePasswordId, setChangePasswordId] = useState<string | null>(null)
  const [changePasswordValue, setChangePasswordValue] = useState('')
  const [changeUsernameId, setChangeUsernameId] = useState<string | null>(null)
  const [changeUsernameValue, setChangeUsernameValue] = useState('')
  const [myPassword, setMyPassword] = useState('')
  const [myPasswordConfirm, setMyPasswordConfirm] = useState('')
  const [changingMyPassword, setChangingMyPassword] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

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

  // Nav permisos por usuario
  const [userNavPermisos, setUserNavPermisos] = useState<Record<string, Record<string, boolean>>>({})
  const [expandedPermUser, setExpandedPermUser] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchConfig()
    checkAdmin()
    fetchProfesionales()
    fetchUserNavPermisos()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchConfig() {
    const { data } = await supabase.from('configuracion').select('*').single()
    if (data) setConfig(data)
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (isAdminEmail(user?.email)) {
      setIsAdmin(true)
      fetchUsers()
    }
  }

  async function fetchUsers() {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
    }
  }

  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('*').order('nombre')
    if (data) setProfesionales(data)
  }

  async function fetchUserNavPermisos() {
    const { data } = await supabase.from('user_nav_permisos').select('user_email, href, visible')
    if (data) {
      const map: Record<string, Record<string, boolean>> = {}
      data.forEach(p => {
        if (!map[p.user_email]) map[p.user_email] = {}
        map[p.user_email][p.href] = p.visible
      })
      setUserNavPermisos(map)
    }
  }

  async function toggleUserNavPermiso(userEmail: string, href: string, value: boolean) {
    setUserNavPermisos(prev => ({
      ...prev,
      [userEmail]: { ...(prev[userEmail] || {}), [href]: value }
    }))
    const { error } = await supabase
      .from('user_nav_permisos')
      .upsert({ user_email: userEmail, href, visible: value, updated_at: new Date().toISOString() })
    if (error) {
      toast.error('Error al actualizar permiso')
      setUserNavPermisos(prev => ({
        ...prev,
        [userEmail]: { ...(prev[userEmail] || {}), [href]: !value }
      }))
    }
  }

  async function handleSave() {
    if (!config) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('configuracion')
        .update({
          nombre_salon: config.nombre_salon,
          telefono: config.telefono,
          direccion: config.direccion,
          zona_horaria: config.zona_horaria,
          intervalo_citas_minutos: config.intervalo_citas_minutos,
          dias_anticipacion_reserva: config.dias_anticipacion_reserva,
          mensaje_confirmacion: config.mensaje_confirmacion,
          mensaje_recordatorio: config.mensaje_recordatorio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
      if (error) throw error
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  function copyBookingLink() {
    const url = `${window.location.origin}/reservar`
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Enlace copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  function toAuthEmail(value: string) {
    return value.includes('@') ? value : `${value}@estetica.local`
  }

  function displayUser(email: string) {
    return email.endsWith('@estetica.local') ? email.replace('@estetica.local', '') : email
  }

  async function handleCreateUser() {
    if (!newEmail || !newPassword) {
      toast.error('Completá usuario/email y contraseña')
      return
    }
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setCreatingUser(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: toAuthEmail(newEmail), password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Usuario creado')
      setNewEmail('')
      setNewPassword('')
      setShowNewUser(false)
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleChangeMyPassword() {
    if (!myPassword || myPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (myPassword !== myPasswordConfirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setChangingMyPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: myPassword })
      if (error) throw error
      toast.success('Contraseña actualizada')
      setMyPassword('')
      setMyPasswordConfirm('')
    } catch {
      toast.error('Error al cambiar la contraseña')
    } finally {
      setChangingMyPassword(false)
    }
  }

  async function handleChangeUserPassword(userId: string) {
    if (!changePasswordValue || changePasswordValue.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password: changePasswordValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Contraseña actualizada')
      setChangePasswordId(null)
      setChangePasswordValue('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    }
  }

  async function handleSetUsername(userId: string) {
    if (!changeUsernameValue.trim()) {
      toast.error('Ingresá un nombre de usuario')
      return
    }
    const newEmail = changeUsernameValue.includes('@') ? changeUsernameValue : `${changeUsernameValue.trim()}@estetica.local`
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Usuario actualizado')
      setChangeUsernameId(null)
      setChangeUsernameValue('')
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar usuario')
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`¿Eliminar al usuario ${email}?`)) return
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Usuario eliminado')
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function handleBackupNow() {
    setBackingUp(true)
    try {
      const res = await fetch('/api/cron/backup-calendario', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Backup completado: ${data.citasBackedUp} citas y ${data.clientesBackedUp} clientes guardados en Google Sheets`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al hacer el backup')
    } finally {
      setBackingUp(false)
    }
  }

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
      fetchUsers()
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

  if (!config) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Tabs defaultValue="general">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="empleados" className="gap-1.5">
            <Users className="h-4 w-4" />
            Empleados
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB GENERAL ========== */}
        <TabsContent value="general" className="space-y-6 mt-6">
          {/* Booking link */}
          <Card>
            <CardHeader>
              <CardTitle>Enlace de reserva online</CardTitle>
              <CardDescription>Compartí este enlace con tus clientes para que reserven online</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/reservar`} readOnly />
                <Button variant="outline" onClick={copyBookingLink} className="gap-2 shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* General settings */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del salón</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del salón</Label>
                  <Input
                    value={config.nombre_salon}
                    onChange={(e) => setConfig({ ...config, nombre_salon: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={config.telefono || ''}
                    onChange={(e) => setConfig({ ...config, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={config.direccion || ''}
                  onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Zona horaria</Label>
                  <Input
                    value={config.zona_horaria}
                    onChange={(e) => setConfig({ ...config, zona_horaria: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo de citas (min)</Label>
                  <Input
                    type="number"
                    value={config.intervalo_citas_minutos}
                    onChange={(e) => setConfig({ ...config, intervalo_citas_minutos: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Días de anticipación</Label>
                  <Input
                    type="number"
                    value={config.dias_anticipacion_reserva}
                    onChange={(e) => setConfig({ ...config, dias_anticipacion_reserva: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Message templates */}
          <Card>
            <CardHeader>
              <CardTitle>Plantillas de mensajes WhatsApp</CardTitle>
              <CardDescription>
                Variables disponibles: {'{cliente}'}, {'{servicio}'}, {'{profesional}'}, {'{fecha}'}, {'{hora}'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensaje de confirmación</Label>
                <Textarea
                  rows={3}
                  value={config.mensaje_confirmacion || ''}
                  onChange={(e) => setConfig({ ...config, mensaje_confirmacion: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mensaje de recordatorio (24h antes)</Label>
                <Textarea
                  rows={3}
                  value={config.mensaje_recordatorio || ''}
                  onChange={(e) => setConfig({ ...config, mensaje_recordatorio: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={loading} size="lg">
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </Button>

          {/* Change own password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Cambiar mi contraseña
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nueva contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={myPassword}
                    onChange={(e) => setMyPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Repetí la contraseña"
                    value={myPasswordConfirm}
                    onChange={(e) => setMyPasswordConfirm(e.target.value)}
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleChangeMyPassword} disabled={changingMyPassword}>
                {changingMyPassword ? 'Cambiando...' : 'Cambiar contraseña'}
              </Button>
            </CardContent>
          </Card>

          {/* Backup manual - admin only */}
          {isAdmin && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DatabaseBackup className="h-5 w-5" />
                    Backup del calendario
                  </CardTitle>
                  <CardDescription>
                    Exporta todas las citas a la pestaña &quot;Backup Calendario&quot; del Google Sheet.
                    El backup automático corre cada día a las 3am.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={handleBackupNow}
                    disabled={backingUp}
                    className="gap-2"
                  >
                    <DatabaseBackup className="h-4 w-4" />
                    {backingUp ? 'Haciendo backup...' : 'Hacer backup ahora'}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* User management - admin only */}
          {isAdmin && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Gestión de usuarios
                      </CardTitle>
                      <CardDescription>Solo visible para el administrador</CardDescription>
                    </div>
                    <Button size="sm" className="gap-2" onClick={() => setShowNewUser(!showNewUser)}>
                      <Plus className="h-4 w-4" />
                      Nuevo usuario
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showNewUser && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Usuario o email</Label>
                          <Input
                            type="text"
                            placeholder="lola / usuario@ejemplo.com"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contraseña</Label>
                          <Input
                            type="text"
                            placeholder="Mínimo 6 caracteres"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleCreateUser} disabled={creatingUser}>
                          {creatingUser ? 'Creando...' : 'Crear usuario'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowNewUser(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead>Último acceso</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <>
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {displayUser(u.email || '')}
                                {u.is_admin && (
                                  <Badge variant="secondary" className="text-[10px]">Admin</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatFechaCorta(u.created_at)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {u.last_sign_in_at ? formatFechaCorta(u.last_sign_in_at) : 'Nunca'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {!u.is_admin && (
                                  <Button
                                    variant={expandedPermUser === u.email ? 'secondary' : 'ghost'}
                                    size="icon"
                                    title="Permisos de menú"
                                    onClick={() => setExpandedPermUser(expandedPermUser === u.email ? null : u.email)}
                                  >
                                    <Menu className="h-4 w-4" />
                                  </Button>
                                )}
                                {!u.is_admin && (
                                  <Button
                                    variant={changeUsernameId === u.id ? 'secondary' : 'ghost'}
                                    size="icon"
                                    title="Cambiar usuario"
                                    onClick={() => {
                                      const current = u.email?.endsWith('@estetica.local') ? u.email.replace('@estetica.local', '') : ''
                                      setChangeUsernameId(changeUsernameId === u.id ? null : u.id)
                                      setChangeUsernameValue(current)
                                    }}
                                  >
                                    <AtSign className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Cambiar contraseña"
                                  onClick={() => { setChangePasswordId(changePasswordId === u.id ? null : u.id); setChangePasswordValue('') }}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                {!u.is_admin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteUser(u.id, u.email || '')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              {changeUsernameId === u.id && (
                                <div className="mt-2 flex gap-2">
                                  <Input
                                    type="text"
                                    placeholder="nombre de usuario"
                                    value={changeUsernameValue}
                                    onChange={(e) => setChangeUsernameValue(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                  <Button size="sm" className="h-8 shrink-0" onClick={() => handleSetUsername(u.id)}>
                                    Guardar
                                  </Button>
                                </div>
                              )}
                              {changePasswordId === u.id && (
                                <div className="mt-2 flex gap-2">
                                  <Input
                                    type="text"
                                    placeholder="Nueva contraseña"
                                    value={changePasswordValue}
                                    onChange={(e) => setChangePasswordValue(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                  <Button size="sm" className="h-8 shrink-0" onClick={() => handleChangeUserPassword(u.id)}>
                                    Guardar
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedPermUser === u.email && (
                            <TableRow key={`${u.id}-permisos`} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={4} className="py-3 px-6">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Páginas visibles</p>
                                <div className="flex flex-wrap gap-x-6 gap-y-2">
                                  {NAV_ITEMS.filter(item => item.href !== '/facturacion' && item.href !== '/informes').map(item => (
                                    <div key={item.href} className="flex items-center gap-2">
                                      <Switch
                                        checked={item.adminOnly
                                          ? userNavPermisos[u.email]?.[item.href] === true
                                          : userNavPermisos[u.email]?.[item.href] !== false}
                                        onCheckedChange={(v) => toggleUserNavPermiso(u.email, item.href, v)}
                                      />
                                      <div className="flex items-center gap-1.5">
                                        <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-sm">{item.label}</span>
                                        {item.adminOnly && (
                                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1 rounded">Admin</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ========== TAB EMPLEADOS ========== */}
        <TabsContent value="empleados" className="space-y-6 mt-6">
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

        </TabsContent>
      </Tabs>

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
    </div>
  )
}
