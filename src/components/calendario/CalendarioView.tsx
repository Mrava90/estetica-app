'use client'

import { useEffect, useState, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional, Horario } from '@/types/database'
import { CalendarioResourceDayView } from './CalendarioResourceDayView'
import { CitaDialog } from './CitaDialog'
import { FiltrosProfesional } from './FiltrosProfesional'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, ChevronDown } from 'lucide-react'
import { DIAS_SEMANA } from '@/lib/constants'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

export function CalendarioView() {
  const [fecha, setFecha] = useState<Date>(new Date())
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [filtrosProfesional, setFiltrosProfesional] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCita, setSelectedCita] = useState<CitaConRelaciones | null>(null)
  const [selectedDate, setSelectedDate] = useState<{ start: Date; end: Date } | null>(null)
  const [selectedProfesionalId, setSelectedProfesionalId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [horariosOpen, setHorariosOpen] = useState(false)
  const [horarios, setHorarios] = useState<Record<string, Horario[]>>({})

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [citasRes, profRes] = await Promise.all([
      supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .in('status', ['pendiente', 'confirmada'])
        .order('fecha_inicio'),
      supabase.from('profesionales').select('*').eq('activo', true).order('nombre'),
    ])

    if (citasRes.data) setCitas(citasRes.data)
    if (profRes.data) {
      setProfesionales(profRes.data)
      if (filtrosProfesional.length === 0) {
        setFiltrosProfesional(profRes.data.map((p) => p.id))
      }
      // Fetch horarios for all professionals
      const { data: horariosData } = await supabase
        .from('horarios')
        .select('*')
        .in('profesional_id', profRes.data.map((p) => p.id))
        .eq('activo', true)
        .order('dia_semana')
      if (horariosData) {
        const grouped: Record<string, Horario[]> = {}
        for (const h of horariosData) {
          if (!grouped[h.profesional_id]) grouped[h.profesional_id] = []
          grouped[h.profesional_id].push(h)
        }
        setHorarios(grouped)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('citas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData, supabase])

  const filteredProfesionales = profesionales.filter((p) => filtrosProfesional.includes(p.id))

  function handleSlotClick(profesionalId: string, start: Date, end: Date) {
    setSelectedCita(null)
    setSelectedDate({ start, end })
    setSelectedProfesionalId(profesionalId)
    setDialogOpen(true)
  }

  function handleCitaClick(cita: CitaConRelaciones) {
    setSelectedCita(cita)
    setSelectedDate(null)
    setSelectedProfesionalId(null)
    setDialogOpen(true)
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setSelectedCita(null)
    setSelectedDate(null)
    setSelectedProfesionalId(null)
    fetchData()
  }

  const isToday =
    fecha.toDateString() === new Date().toDateString()

  const fechaLabel = format(fecha, "EEEE d/MM/yy", { locale: es })

  return (
    <div className="space-y-3">
      {/* Date navigation + availability + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFecha(subDays(fecha, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <CalendarDays className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={(d) => {
                  if (d) {
                    setFecha(d)
                    setCalendarOpen(false)
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFecha(addDays(fecha, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={horariosOpen ? 'default' : 'outline'}
            size="sm"
            className="ml-1 gap-1.5 text-xs"
            onClick={() => setHorariosOpen(!horariosOpen)}
          >
            <Clock className="h-3.5 w-3.5" />
            Horarios
            <ChevronDown className={`h-3 w-3 transition-transform ${horariosOpen ? 'rotate-180' : ''}`} />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setFecha(new Date())}>
              Hoy
            </Button>
          )}
          <span className="ml-2 text-sm font-semibold capitalize">{fechaLabel}</span>
        </div>
        <FiltrosProfesional
          profesionales={profesionales}
          activos={filtrosProfesional}
          onChange={setFiltrosProfesional}
        />
      </div>

      {/* Availability panel */}
      {horariosOpen && (
        <div className="rounded-lg border bg-card p-3 animate-in slide-in-from-top-2 fade-in-0 duration-200">
          <div className="flex flex-wrap gap-4">
            {profesionales.map((prof) => {
              const profHorarios = horarios[prof.id] || []
              const diaSemana = fecha.getDay()
              const horarioHoy = profHorarios.find((h) => h.dia_semana === diaSemana)

              return (
                <div key={prof.id} className="flex items-center gap-2 min-w-[140px]">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: prof.color }}
                  />
                  <div className="text-sm">
                    <span className="font-medium">{prof.nombre}</span>
                    {horarioHoy ? (
                      <span className="ml-1.5 text-muted-foreground">
                        {horarioHoy.hora_inicio.slice(0, 5)} - {horarioHoy.hora_fin.slice(0, 5)}
                      </span>
                    ) : (
                      <span className="ml-1.5 text-muted-foreground/60 italic">Libre</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resource day view */}
      {filteredProfesionales.length > 0 ? (
        <CalendarioResourceDayView
          fecha={fecha}
          citas={citas}
          profesionales={filteredProfesionales}
          onSlotClick={handleSlotClick}
          onCitaClick={handleCitaClick}
        />
      ) : (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          Seleccioná al menos un profesional para ver el calendario.
        </div>
      )}

      <CitaDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        cita={selectedCita}
        selectedDate={selectedDate}
        selectedProfesionalId={selectedProfesionalId}
        profesionales={profesionales}
      />
    </div>
  )
}
