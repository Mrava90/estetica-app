'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, Fingerprint, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegisterFingerprintDialog({ open, onOpenChange }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleRegister() {
    setStatus('loading')
    setMessage('')

    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
      })

      if (!optRes.ok) {
        const err = await optRes.json().catch(() => ({}))
        throw new Error(err.error || `Error al iniciar registro (${optRes.status})`)
      }

      const { options, challengeId } = await optRes.json()

      let regResponse
      try {
        regResponse = await startRegistration({ optionsJSON: options })
      } catch {
        throw new Error('Registro cancelado o no disponible en este dispositivo')
      }

      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, response: regResponse }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}))
        throw new Error(err.error || `Error al verificar registro (${verifyRes.status})`)
      }

      setStatus('success')
      setMessage('¡Huella registrada correctamente! Ya podés ingresar con tu huella digital.')
    } catch (err: unknown) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  function handleClose() {
    setStatus('idle')
    setMessage('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar huella digital</DialogTitle>
          <DialogDescription>
            Usá tu huella, Face ID o PIN del dispositivo para ingresar más rápido la próxima vez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {status === 'success' ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-center text-sm text-muted-foreground">{message}</p>
              <Button className="w-full" onClick={handleClose}>
                Listo
              </Button>
            </>
          ) : (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                {status === 'loading' ? (
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                ) : (
                  <Fingerprint className="h-10 w-10 text-primary" />
                )}
              </div>

              {status === 'error' && (
                <p className="text-center text-sm text-destructive">{message}</p>
              )}

              <p className="text-center text-sm text-muted-foreground">
                {status === 'loading'
                  ? 'Seguí las instrucciones del dispositivo...'
                  : 'Al presionar el botón, tu dispositivo te pedirá verificar tu identidad.'}
              </p>

              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose} disabled={status === 'loading'}>
                  Cancelar
                </Button>
                <Button className="flex-1 gap-2" onClick={handleRegister} disabled={status === 'loading'}>
                  {status === 'loading' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</>
                  ) : (
                    <><Fingerprint className="h-4 w-4" /> Registrar</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
