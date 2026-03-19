'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora } from '@/lib/dates'
import { CheckCircle, Mail } from 'lucide-react'

function ExitoContent() {
  const searchParams = useSearchParams()
  const fecha = searchParams.get('fecha')
  const citaId = searchParams.get('cita')
  const emailParam = searchParams.get('email')

  const [enviando, setEnviando] = useState(false)
  const [linkEnviado, setLinkEnviado] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (emailParam && citaId) {
      sendMagicLink(emailParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMagicLink(email: string) {
    setEnviando(true)
    setError('')
    try {
      if (citaId) {
        await fetch('/api/mis-turnos/registrar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, citaId }),
        })
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/reservar/mis-turnos`,
          shouldCreateUser: false,
        },
      })
      // Si el usuario no existe, igual mostramos éxito (no exponemos si existe o no)
      if (otpError && otpError.message !== 'Signups not allowed for otp') {
        throw otpError
      }
      setLinkEnviado(true)
    } catch {
      setError('No se pudo enviar el link.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-6 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white drop-shadow-md">¡Turno confirmado!</h1>
        <p className="text-white/80">Tu turno ha sido reservado exitosamente</p>
      </div>

      {fecha && (
        <div className="rounded-xl border border-gray-900 bg-white p-6 text-center shadow-sm w-full max-w-sm">
          <p className="text-sm text-gray-500">Fecha del turno</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{formatFechaHora(fecha)}</p>
        </div>
      )}

      {emailParam && (
        <div className="rounded-xl border border-fuchsia-200 bg-white p-5 w-full max-w-sm space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-fuchsia-500 shrink-0" />
            <p className="text-sm font-semibold text-gray-700">Gestionar mis turnos</p>
          </div>
          {linkEnviado ? (
            <div className="space-y-1 py-1">
              <p className="text-sm font-medium text-green-700">¡Link enviado a {emailParam}!</p>
              <p className="text-xs text-gray-500">Revisá tu email para ver y cancelar tus turnos</p>
            </div>
          ) : enviando ? (
            <p className="text-sm text-gray-500 py-1">Enviando link...</p>
          ) : (
            <div className="space-y-2">
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={() => sendMagicLink(emailParam)}
                className="text-sm font-medium text-fuchsia-600 hover:underline"
              >
                Reenviar link a {emailParam}
              </button>
            </div>
          )}
        </div>
      )}

      <Link
        href="/reservar"
        className="rounded-xl bg-black px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-900 shadow-lg"
      >
        Reservar otro turno
      </Link>
    </div>
  )
}

export default function ExitoPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400 py-12">Cargando...</div>}>
      <ExitoContent />
    </Suspense>
  )
}
