'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatFechaHora } from '@/lib/dates'
import { CheckCircle, Calendar, X } from 'lucide-react'

function ExitoContent() {
  const searchParams = useSearchParams()
  const fecha = searchParams.get('fecha')
  const citaId = searchParams.get('cita')

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

      {citaId && (
        <div className="rounded-xl border border-fuchsia-200 bg-white p-5 w-full max-w-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700 text-center">¿Necesitás cambiar o cancelar?</p>
          <div className="flex gap-2">
            <Link
              href={`/reservar/mi-turno/${citaId}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              <Calendar className="h-4 w-4" />
              Reprogramar
            </Link>
            <Link
              href={`/reservar/mi-turno/${citaId}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Link>
          </div>
          <p className="text-xs text-gray-400 text-center">Guardá este link para gestionar tu turno</p>
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
