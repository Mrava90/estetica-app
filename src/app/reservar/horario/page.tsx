'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { type SlotDisponible } from '@/lib/disponibilidad'
import { formatHora, formatPrecio } from '@/lib/dates'
import { fechaArYMD, formatAR } from '@/lib/timezone'
import type { Servicio, Profesional, Promocion } from '@/types/database'
import { addDays } from 'date-fns'

// "Hoy" en Argentina (independiente de la TZ del dispositivo).
// Un cliente con celular mal configurado veia otro dia como "hoy" y las tiras
// de fechas quedaban corridas.
function hoyAR(): Date {
  return new Date(fechaArYMD() + 'T00:00:00-03:00')
}
import { ArrowLeft, Sparkles } from 'lucide-react'
import { calcularPrecioConPromo } from '@/lib/promociones'

function HorarioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const servicioId = searchParams.get('servicio')
  const profesionalId = searchParams.get('profesional')

  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedDate, setSelectedDate] = useState(hoyAR())
  const [slots, setSlots] = useState<Record<string, SlotDisponible[]>>({})
  const [selectedSlot, setSelectedSlot] = useState<{ profId: string; slot: SlotDisponible } | null>(null)
  const [diasAnticipacion, setDiasAnticipacion] = useState(7)
  const [apiError, setApiError] = useState(false)
  const [promos, setPromos] = useState<Promocion[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!servicioId) {
      router.push('/reservar')
      return
    }
    // Fetch everything in parallel on mount
    Promise.all([
      supabase.from('servicios').select('*').eq('id', servicioId).single(),
      fetchProfesionalesData(),
      supabase.from('configuracion').select('dias_anticipacion_reserva').single(),
      fetch('/api/promociones/activas').then(r => r.ok ? r.json() : { items: [] }),
    ]).then(([servRes, profs, configRes, promosRes]) => {
      if (servRes.data) setServicio(servRes.data)
      if (profs.length > 0) setProfesionales(profs)
      if (configRes.data?.dias_anticipacion_reserva) setDiasAnticipacion(configRes.data.dias_anticipacion_reserva)
      if (promosRes?.items) setPromos(promosRes.items as Promocion[])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (servicio && profesionales.length > 0) {
      fetchAvailability()
    }
  }, [selectedDate, servicio, profesionales]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfesionalesData(): Promise<Profesional[]> {
    if (profesionalId) {
      const { data } = await supabase.from('profesionales').select('*').eq('id', profesionalId).single()
      return data ? [data] : []
    }
    const { data: profServData } = await supabase
      .from('profesional_servicios')
      .select('profesional_id')
      .eq('servicio_id', servicioId!)
    if (profServData && profServData.length > 0) {
      const ids = profServData.map((d) => d.profesional_id)
      const { data } = await supabase
        .from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).in('id', ids).order('nombre')
      return data || []
    }
    const { data } = await supabase.from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).order('nombre')
    return data || []
  }

  async function fetchAvailability() {
    if (!servicio || profesionales.length === 0) return
    const dateStr = formatAR(selectedDate, 'yyyy-MM-dd')

    // Ahora la API server-side devuelve solo slots ya disponibles (calcula todo con
    // service_role: horarios, citas, bloqueos, desbloqueos). El cliente ya no consulta
    // esas tablas anonimamente — antes se filtraban al navegador, ahora quedan en el server.
    const params = new URLSearchParams({ servicioId: servicio.id, fecha: dateStr })
    if (profesionalId) params.set('profesionalId', profesionalId)

    setApiError(false)
    let res: Response
    try {
      res = await fetch(`/api/reservar/disponibilidad?${params.toString()}`)
    } catch {
      setSlots({})
      setApiError(true)
      return
    }
    if (!res.ok) {
      setSlots({})
      // 503 = problema temporal del servidor. UX distinta a "no hay horarios reales".
      if (res.status >= 500) setApiError(true)
      return
    }
    const data = await res.json()
    const bruto = (data.slots || {}) as Record<string, Array<{ inicio: string; fin: string }>>

    const newSlots: Record<string, SlotDisponible[]> = {}
    for (const [profId, arr] of Object.entries(bruto)) {
      newSlots[profId] = arr.map((s) => ({ inicio: new Date(s.inicio), fin: new Date(s.fin) }))
    }
    setSlots(newSlots)
  }

  function handleSelectSlot(profId: string, slot: SlotDisponible) {
    setSelectedSlot({ profId, slot })
  }

  function handleContinue() {
    if (!selectedSlot || !servicioId) return
    const params = new URLSearchParams({
      servicio: servicioId,
      profesional: selectedSlot.profId,
      inicio: selectedSlot.slot.inicio.toISOString(),
      fin: selectedSlot.slot.fin.toISOString(),
    })
    router.push(`/reservar/confirmar?${params.toString()}`)
  }

  const dates = Array.from({ length: diasAnticipacion }, (_, i) => addDays(hoyAR(), i))

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white drop-shadow-md">Elegí fecha y horario</h1>
        {servicio && (
          <p className="text-sm text-white/80 mt-1">{servicio.nombre} - {servicio.duracion_minutos} min</p>
        )}
      </div>

      {/* Date selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {dates.map((date) => {
          const isSelected = selectedDate.toDateString() === date.toDateString()
          return (
            <button
              key={date.toISOString()}
              onClick={() => {
                setSelectedDate(date)
                setSelectedSlot(null)
              }}
              className={`flex flex-col items-center rounded-xl border px-4 py-2.5 text-sm transition-all shrink-0 ${
                isSelected
                  ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-md'
                  : 'border-gray-900 bg-white text-gray-700 hover:border-fuchsia-500'
              }`}
            >
              <span className="text-xs uppercase font-medium">
                {formatAR(date, 'EEE')}
              </span>
              <span className="text-lg font-bold">{formatAR(date, 'd')}</span>
              <span className="text-xs">{formatAR(date, 'MMM')}</span>
            </button>
          )
        })}
      </div>

      {/* Time slots per professional */}
      <div className="space-y-4">
        {apiError ? (
          <div className="rounded-xl border border-amber-400 bg-white p-8 text-center space-y-2">
            <p className="text-amber-700 font-medium">No pudimos cargar los horarios ahora mismo</p>
            <p className="text-gray-500 text-sm">Puede ser un problema temporal, probá refrescar en unos segundos.</p>
          </div>
        ) : Object.keys(slots).length === 0 ? (
          <div className="rounded-xl border border-gray-900 bg-white p-8 text-center">
            <p className="text-gray-500">No hay horarios disponibles para este día</p>
          </div>
        ) : (
          profesionales
            .filter((p) => slots[p.id])
            .map((prof) => (
              <div key={prof.id} className="rounded-xl border border-gray-900 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-full" style={{ backgroundColor: prof.color }} />
                  <h3 className="font-semibold text-gray-900">{prof.nombre}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {slots[prof.id]?.map((slot, i) => {
                    const isSelected =
                      selectedSlot?.profId === prof.id &&
                      selectedSlot?.slot.inicio.getTime() === slot.inicio.getTime()

                    // Calcular precio con promo para este slot específico
                    const precioInfo = servicio && promos.length > 0
                      ? calcularPrecioConPromo({
                          precioBase: servicio.precio_efectivo || 0,
                          promociones: promos,
                          fechaInicio: slot.inicio,
                          servicioId: servicio.id,
                          profesionalId: prof.id,
                          metodoPago: 'efectivo', // asumimos efectivo para preview (la mayoría de promos son en efectivo)
                        })
                      : null

                    const tienePromo = precioInfo && precioInfo.descuento > 0

                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectSlot(prof.id, slot)}
                        className={`relative rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-md'
                            : tienePromo
                            ? 'border-fuchsia-400 bg-fuchsia-50 text-gray-800 hover:border-fuchsia-500'
                            : 'border-gray-900 bg-white text-gray-700 hover:border-fuchsia-500'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="flex items-center gap-1">
                            {tienePromo && <Sparkles className={`h-3 w-3 ${isSelected ? 'text-white' : 'text-fuchsia-500'}`} />}
                            {formatHora(slot.inicio)}
                          </span>
                          {tienePromo && (
                            <span className="flex items-baseline gap-1 text-[10px] mt-0.5">
                              <span className={`line-through ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                                {formatPrecio(precioInfo!.precioOriginal)}
                              </span>
                              <span className={`font-bold ${isSelected ? 'text-white' : 'text-fuchsia-600'}`}>
                                {formatPrecio(precioInfo!.precioFinal)}
                              </span>
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
        )}
      </div>

      <button
        onClick={handleContinue}
        disabled={!selectedSlot}
        className="w-full rounded-xl bg-black py-4 text-center text-base font-semibold text-white transition-all hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        Continuar
      </button>
    </div>
  )
}

export default function HorarioPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400 py-12">Cargando...</div>}>
      <HorarioContent />
    </Suspense>
  )
}
