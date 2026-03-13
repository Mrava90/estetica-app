'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora, formatPrecio } from '@/lib/dates'
import type { CitaConRelaciones } from '@/types/database'
import { NailIcon } from '@/components/reservar/ReservarHeader'
import { CalendarDays, User, ArrowLeft, Calendar, X, CheckCircle } from 'lucide-react'

export default function MiTurnoPage() {
  const params = useParams()
  const router = useRouter()
  const citaId = params.id as string
  const [cita, setCita] = useState<CitaConRelaciones | null>(null)
  const [loading, setLoading] = useState(true)
  const [accion, setAccion] = useState<'cancelar' | 'reprogramar' | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function fetchCita() {
      const { data } = await supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .eq('id', citaId)
        .single()
      setCita(data)
      setLoading(false)
    }
    fetchCita()
  }, [citaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancelar() {
    setProcesando(true)
    const { error } = await supabase
      .from('citas')
      .update({ status: 'cancelada' })
      .eq('id', citaId)
    setProcesando(false)
    if (!error) setDone(true)
  }

  function handleReprogramar() {
    if (!cita?.servicios || !cita?.profesionales) return
    const params = new URLSearchParams({
      servicio: cita.servicios.id,
      profesional: cita.profesionales.id,
      reprogramar: citaId,
    })
    router.push(`/reservar/horario?${params.toString()}`)
  }

  if (loading) return <div className="text-center text-gray-400 py-12">Cargando...</div>

  if (!cita) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-white font-semibold">No se encontró el turno</p>
      <button onClick={() => router.push('/reservar')} className="text-sm text-white/70 underline">Reservar nuevo turno</button>
    </div>
  )

  const isPasado = new Date(cita.fecha_inicio) < new Date()
  const isCancelado = cita.status === 'cancelada'

  if (done) return (
    <div className="flex flex-col items-center space-y-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-bold text-white drop-shadow-md">Turno cancelado</h1>
        <p className="text-white/70 text-sm mt-1">Tu turno fue cancelado correctamente</p>
      </div>
      <button
        onClick={() => router.push('/reservar')}
        className="rounded-xl bg-black px-8 py-3 text-sm font-semibold text-white hover:bg-gray-900 shadow-lg"
      >
        Reservar nuevo turno
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/reservar')}
        className="flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white drop-shadow-md">Mi turno</h1>
        <p className="text-sm text-white/80 mt-1">Detalle y opciones de gestión</p>
      </div>

      {/* Detalle */}
      <div className="rounded-xl border border-gray-900 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Resumen</h2>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isCancelado ? 'bg-red-100 text-red-700' :
            cita.status === 'confirmada' ? 'bg-blue-100 text-blue-700' :
            cita.status === 'completada' ? 'bg-green-100 text-green-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {isCancelado ? 'Cancelado' : cita.status === 'confirmada' ? 'Confirmado' : cita.status === 'completada' ? 'Completado' : 'Pendiente'}
          </span>
        </div>
        <div className="space-y-3">
          {cita.servicios && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 shrink-0">
                <NailIcon className="h-4 w-4 text-fuchsia-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{cita.servicios.nombre}</p>
                <p className="text-xs text-gray-500">{cita.servicios.duracion_minutos} min · {formatPrecio(cita.servicios.precio_efectivo)}</p>
              </div>
            </div>
          )}
          {cita.profesionales && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 shrink-0">
                <User className="h-4 w-4 text-gray-600" />
              </div>
              <p className="text-sm text-gray-900">{cita.profesionales.nombre}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 shrink-0">
              <CalendarDays className="h-4 w-4 text-gray-600" />
            </div>
            <p className="text-sm text-gray-900">{formatFechaHora(cita.fecha_inicio)}</p>
          </div>
        </div>
      </div>

      {/* Acciones */}
      {!isPasado && !isCancelado && cita.status !== 'completada' && (
        <div className="space-y-3">
          {accion === 'cancelar' ? (
            <div className="rounded-xl border border-red-200 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900">¿Confirmás la cancelación?</p>
              <p className="text-sm text-gray-500">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelar}
                  disabled={procesando}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-all"
                >
                  {procesando ? 'Cancelando...' : 'Sí, cancelar'}
                </button>
                <button
                  onClick={() => setAccion(null)}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setAccion('cancelar')}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-all shadow-sm"
              >
                <X className="h-4 w-4" />
                Cancelar turno
              </button>
              <button
                onClick={handleReprogramar}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-sm font-semibold text-white hover:bg-gray-900 transition-all shadow-sm"
              >
                <Calendar className="h-4 w-4" />
                Reprogramar
              </button>
            </div>
          )}
        </div>
      )}

      {(isPasado || isCancelado || cita.status === 'completada') && (
        <div className="rounded-xl border border-gray-200 bg-white/80 p-4 text-center">
          <p className="text-sm text-gray-500">
            {isCancelado ? 'Este turno fue cancelado.' : isPasado ? 'Este turno ya pasó.' : 'Este turno fue completado.'}
          </p>
          <button onClick={() => router.push('/reservar')} className="mt-2 text-sm text-fuchsia-600 font-medium hover:underline">
            Reservar nuevo turno
          </button>
        </div>
      )}
    </div>
  )
}
