'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Configuracion } from '@/types/database'
import { formatFechaCorta } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Copy, Check, Plus, Trash2, Shield, KeyRound } from 'lucide-react'

const ADMIN_EMAIL = 'ravamartin@gmail.com'

interface AppUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
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
  const [myPassword, setMyPassword] = useState('')
  const [myPasswordConfirm, setMyPasswordConfirm] = useState('')
  const [changingMyPassword, setChangingMyPassword] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchConfig()
    checkAdmin()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchConfig() {
    const { data } = await supabase.from('configuracion').select('*').single()
    if (data) setConfig(data)
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email === ADMIN_EMAIL) {
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

  async function handleCreateUser() {
    if (!newEmail || !newPassword) {
      toast.error('Completá email y contraseña')
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
        body: JSON.stringify({ email: newEmail, password: newPassword }),
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

  if (!config) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

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
                      <Label>Email</Label>
                      <Input
                        type="email"
                        placeholder="usuario@ejemplo.com"
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
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.email}
                          {u.email === ADMIN_EMAIL && (
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
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Cambiar contraseña"
                            onClick={() => { setChangePasswordId(changePasswordId === u.id ? null : u.id); setChangePasswordValue('') }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {u.email !== ADMIN_EMAIL && (
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
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
