'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scissors } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // /auth/confirm already exchanged the code and set the session server-side.
    // Just check if we have an active session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
        return
      }

      // Fallback: listen for PASSWORD_RECOVERY event (implicit flow)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setReady(true)
        }
      })

      // If no session and no event after 4s, the link is invalid/expired
      const timeout = setTimeout(() => setLinkInvalid(true), 4000)

      return () => {
        subscription.unsubscribe()
        clearTimeout(timeout)
      }
    })
  }, [])

  async function handleUpdatePassword() {
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('Error al actualizar la contraseña. Intentá de nuevo.')
      setLoading(false)
      return
    }

    // Clear the recovery_pending cookie so middleware allows navigation
    document.cookie = 'recovery_pending=; Max-Age=0; path=/'
    setSuccess(true)
    setTimeout(() => router.push('/calendario'), 2000)
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Contraseña actualizada</CardTitle>
          <CardDescription>Tu contraseña fue cambiada exitosamente. Redirigiendo...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (linkInvalid) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
            <Scissors className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Link inválido o expirado</CardTitle>
          <CardDescription>El enlace de recuperación ya no es válido. Solicitá uno nuevo.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={() => router.push('/login')}>
            Solicitar nuevo link
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!ready) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Verificando...</CardTitle>
          <CardDescription>Estamos verificando tu enlace de recuperación</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Scissors className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl">Nueva contraseña</CardTitle>
        <CardDescription>Ingresá tu nueva contraseña</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar contraseña</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="Repetí la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        <Button className="w-full" onClick={handleUpdatePassword} disabled={loading}>
          {loading ? 'Actualizando...' : 'Actualizar contraseña'}
        </Button>
      </CardContent>
    </Card>
  )
}
