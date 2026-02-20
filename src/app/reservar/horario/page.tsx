'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcularSlotsDisponibles, type SlotDisponible } from '@/lib/disponibilidad'
import { formatHora } from '@/lib/dates'
import type { Servicio, Profesional } from '@/types/database'
import { addDays, startOfDay, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
      const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
      if (data) setProfesionales(data)
    }
  }

  async function fetchAvailability() {
    if (!servicio) return
    const diaSemana = selectedDate.getDay()
    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    const newSlots: Record<string, SlotDisponible[]> = {}

    for (const prof of profesionales) {
      const { data: horarioData } = await supabase
        .from('horarios')
        .select('*')
        .eq('profesional_id', prof.id)
        .eq('dia_semana', diaSemana)
        .eq('activo', true)
        .single()

      const { data: citasData } = await supabase
        .from('citas')
        .select('fecha_inicio, fecha_fin')
        .eq('profesional_id', prof.id)
        .in('status', ['pendiente', 'confirmada'])
        .gte('fecha_inicio', `${dateStr}T00:00:00`)
        .lt('fecha_inicio', `${dateStr}T23:59:59`)

      const available = calcularSlotsDisponibles(
        selectedDate,
        horarioData ? { hora_inicio: horarioData.hora_inicio, hora_fin: horarioData.hora_fin } : null,
        citasData || [],
        servicio.duracion_minutos
      )

      if (available.length > 0) {
        newSlots[prof.id] = available
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
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Elegí fecha y horario</h1>
        {servicio && <p className="text-muted-foreground">{servicio.nombre} - {servicio.duracion_minutos} min</p>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {dates.map((date) => (
          <button
            key={date.toISOString()}
            onClick={() => {
              setSelectedDate(date)
              setSelectedSlot(null)
            }}
            className={`flex flex-col items-center rounded-lg border px-4 py-2 text-sm transition-colors shrink-0 ${
              selectedDate.toDateString() === date.toDateString()
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <span className="text-xs uppercase">
              {format(date, 'EEE')}
            </span>
            <span className="text-lg font-bold">{format(date, 'd')}</span>
            <span className="text-xs">{format(date, 'MMM')}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {Object.keys(slots).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay horarios disponibles para este día</p>
        ) : (
          profesionales
            .filter((p) => slots[p.id])
            .map((prof) => (
              <Card key={prof.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-6 w-6 rounded-full" style={{ backgroundColor: prof.color }} />
                    <h3 className="font-medium">{prof.nombre}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slots[prof.id]?.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSlot(prof.id, slot)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          selectedSlot?.profId === prof.id && selectedSlot?.slot.inicio.getTime() === slot.inicio.getTime()
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {formatHora(slot.inicio)}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
        )}
      </div>

      <Button
        onClick={handleContinue}
        disabled={!selectedSlot}
        size="lg"
        className="w-full"
      >
        Continuar
      </Button>
    </div>
  )
}

export default function HorarioPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground py-12">Cargando...</div>}>
      <HorarioContent />
    </Suspense>
  )
}
