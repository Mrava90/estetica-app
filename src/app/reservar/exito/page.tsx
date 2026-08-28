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
  const [emailNoRegistrado, setEmailNoRegistrado] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (emailParam && citaId) {
      sendMagicLink()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMagicLink() {
    setEnviando(true)
    setError('')
    setEmailNoRegistrado(false)
    try {
      // Solo mandamos citaId. Email y nombre se toman server-side desde la DB
      // para evitar abuso del SMTP con direcciones arbitrarias.
      // La API responde { ok: true, sent: true|false }: sent=false significa que
      // el cliente no tiene email guardado (typicamente un cliente existente
      // cuyo email no se sobreescribe por seguridad).
      const res = await fetch('/api/notificar-turno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citaId }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      const data = await res.json().catch(() => ({}))
      if (data.sent === false) {
        setEmailNoRegistrado(true)
      } else {
        setLinkEnviado(true)
      }
    } catch {
      setError('No se pudo enviar el email.')
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
              <p className="text-sm font-medium text-green-700">¡Link enviado a tu email!</p>
              <p className="text-xs text-gray-500">Revisá tu casilla para ver y cancelar tus turnos</p>
            </div>
          ) : emailNoRegistrado ? (
            <div className="space-y-1 py-1">
              <p className="text-sm font-medium text-amber-700">Todavía no podemos enviarte el link automáticamente.</p>
              <p className="text-xs text-gray-500">
                Tu email no está asociado a tu cuenta. Escribinos por WhatsApp para vincularlo y podés gestionar tus turnos vos misma más adelante.
              </p>
            </div>
          ) : enviando ? (
            <p className="text-sm text-gray-500 py-1">Enviando link...</p>
          ) : (
            <div className="space-y-2">
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={sendMagicLink}
                className="text-sm font-medium text-fuchsia-600 hover:underline"
              >
                Reenviar link
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
