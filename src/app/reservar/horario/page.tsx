'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcularSlotsDisponibles, type SlotDisponible } from '@/lib/disponibilidad'
import { formatHora } from '@/lib/dates'
import type { Servicio, Profesional } from '@/types/database'
import { addDays, startOfDay, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'

function HorarioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const servicioId = searchParams.get('servicio')
  const profesionalId = searchParams.get('profesional')

  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()))
  const [slots, setSlots] = useState<Record<string, SlotDisponible[]>>({})
  const [selectedSlot, setSelectedSlot] = useState<{ profId: string; slot: SlotDisponible } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!servicioId) {
      router.push('/reservar')
      return
    }
    fetchServicio()
    fetchProfesionales()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (servicio && profesionales.length > 0) {
      fetchAvailability()
    }
  }, [selectedDate, servicio, profesionales]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchServicio() {
    const { data } = await supabase.from('servicios').select('*').eq('id', servicioId).single()
    if (data) setServicio(data)
  }

  async function fetchProfesionales() {
    if (profesionalId) {
      const { data } = await supabase.from('profesionales').select('*').eq('id', profesionalId).single()
      if (data) setProfesionales([data])
    } else {
      // Filter by service relationship
      const { data: profServData } = await supabase
        .from('profesional_servicios')
        .select('profesional_id')
        .eq('servicio_id', servicioId!)

      if (profServData && profServData.length > 0) {
        const ids = profServData.map((d) => d.profesional_id)
        const { data } = await supabase
          .from('profesionales')
          .select('*')
          .eq('activo', true)
          .in('id', ids)
          .order('nombre')
        if (data) setProfesionales(data)
      } else {
        // No records = all professionals (backwards compatible)
        const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
        if (data) setProfesionales(data)
      }
    }
  }

  async function fetchAvailability() {
    if (!servicio) return
    const diaSemana = selectedDate.getDay()
    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    const newSlots: Record<string, SlotDisponible[]> = {}

    for (const prof of profesionales) {
      const [{ data: horariosData }, { data: citasData }, { data: bloqueosData }] = await Promise.all([
        supabase
          .from('horarios')
          .select('*')
          .eq('profesional_id', prof.id)
          .eq('dia_semana', diaSemana)
          .eq('activo', true)
          .order('hora_inicio'),
        supabase
          .from('citas')
          .select('fecha_inicio, fecha_fin')
          .eq('profesional_id', prof.id)
          .in('status', ['pendiente', 'confirmada'])
          .gte('fecha_inicio', `${dateStr}T00:00:00`)
          .lt('fecha_inicio', `${dateStr}T23:59:59`),
        supabase
          .from('bloqueos')
          .select('fecha_inicio, fecha_fin')
          .eq('profesional_id', prof.id)
          .gte('fecha_inicio', `${dateStr}T00:00:00`)
          .lt('fecha_inicio', `${dateStr}T23:59:59`),
      ])

      // Support multiple schedule blocks per day (split shifts)
      const allAvailable: SlotDisponible[] = []
      if (horariosData && horariosData.length > 0) {
        for (const horario of horariosData) {
          const available = calcularSlotsDisponibles(
            selectedDate,
            { hora_inicio: horario.hora_inicio, hora_fin: horario.hora_fin },
            citasData || [],
            servicio.duracion_minutos,
            30,
            bloqueosData || []
          )
          allAvailable.push(...available)
        }
      }

      if (allAvailable.length > 0) {
        newSlots[prof.id] = allAvailable
      }
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

  const dates = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i))

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-fuchsia-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Elegí fecha y horario</h1>
        {servicio && (
          <p className="text-sm text-gray-500 mt-1">{servicio.nombre} - {servicio.duracion_minutos} min</p>
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
                {format(date, 'EEE', { locale: es })}
              </span>
              <span className="text-lg font-bold">{format(date, 'd')}</span>
              <span className="text-xs">{format(date, 'MMM', { locale: es })}</span>
            </button>
          )
        })}
      </div>

      {/* Time slots per professional */}
      <div className="space-y-4">
        {Object.keys(slots).length === 0 ? (
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
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectSlot(prof.id, slot)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-md'
                            : 'border-gray-900 bg-white text-gray-700 hover:border-fuchsia-500'
                        }`}
                      >
                        {formatHora(slot.inicio)}
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
