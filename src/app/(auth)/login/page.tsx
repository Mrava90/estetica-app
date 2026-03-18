'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { loginSchema, type LoginInput } from '@/lib/validators'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Fingerprint, Scissors } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const usernameValue = watch('email')

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setError('')

    // Si no tiene @, es un nombre de usuario → convertir a email interno
    const authEmail = data.email.includes('@') ? data.email : `${data.email}@estetica.local`

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: data.password,
    })

    if (authError) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleBiometric() {
    setBiometricLoading(true)
    setError('')

    try {
      // Lazy import to avoid SSR issues
      const { startAuthentication } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/auth/webauthn/authenticate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameValue || '' }),
      })

      if (!optRes.ok) {
        const err = await optRes.json().catch(() => ({}))
        throw new Error(err.error || `Error al iniciar autenticación (${optRes.status})`)
      }

      const { options, challengeId } = await optRes.json()

      let authResponse
      try {
        authResponse = await startAuthentication({ optionsJSON: options })
      } catch {
        throw new Error('Autenticación biométrica cancelada o no disponible')
      }

      const verifyRes = await fetch('/api/auth/webauthn/authenticate-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, response: authResponse }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}))
        throw new Error(err.error || `Verificación fallida (${verifyRes.status})`)
      }

      const { tokenHash } = await verifyRes.json()

      const supabase = createClient()
      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      })

      if (sessionError) {
        throw new Error('Error al crear sesión')
      }

      router.push('/calendario')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en autenticación biométrica'
      setError(msg)
    } finally {
      setBiometricLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!resetEmail) {
      setError('Ingresá tu email')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    })
    if (resetError) {
      setError('Error al enviar el email. Verificá que el email sea correcto.')
    } else {
      setResetSent(true)
    }
    setLoading(false)
  }

  if (resetMode) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            {resetSent
              ? 'Revisá tu bandeja de entrada'
              : 'Ingresá tu email y te enviamos un link para restablecer tu contraseña'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resetSent ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Se envió un email a <span className="font-medium">{resetEmail}</span> con un enlace para restablecer tu contraseña.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setResetMode(false); setResetSent(false); setResetEmail(''); setError('') }}
              >
                Volver al login
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <Button className="w-full" onClick={handleResetPassword} disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperación'}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setResetMode(false); setError('') }}
              >
                Volver al login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Scissors className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
        <CardDescription>Ingresá tus credenciales para acceder al sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Usuario o email</Label>
            <Input
              id="email"
              type="text"
              placeholder=""
              autoComplete="username"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading || biometricLoading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">o</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleBiometric}
            disabled={loading || biometricLoading}
          >
            <Fingerprint className="h-4 w-4" />
            {biometricLoading ? 'Verificando...' : 'Ingresar con huella / Face ID'}
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full text-sm"
            onClick={() => { setResetMode(true); setError('') }}
          >
            Olvidé mi contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
