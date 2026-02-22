'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatFechaHora } from '@/lib/dates'
import { CheckCircle } from 'lucide-react'

function ExitoContent() {
  const searchParams = useSearchParams()
  const fecha = searchParams.get('fecha')

  return (
    <div className="flex flex-col items-center space-y-6 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">¡Turno confirmado!</h1>
        <p className="text-gray-500">
          Tu turno ha sido reservado exitosamente
        </p>
      </div>

      {fecha && (
        <div className="rounded-xl border border-gray-900 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-500">Fecha del turno</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{formatFechaHora(fecha)}</p>
        </div>
      )}

      <p className="text-sm text-gray-500 text-center max-w-sm">
        Te enviaremos un recordatorio por WhatsApp antes de tu cita.
        Si necesitás cancelar o cambiar el turno, contactanos.
      </p>

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
