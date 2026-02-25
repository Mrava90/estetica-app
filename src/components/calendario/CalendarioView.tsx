'use client'

import { useEffect, useState, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional, Horario, Bloqueo } from '@/types/database'
import { CalendarioResourceDayView } from './CalendarioResourceDayView'
import { CitaDialog } from './CitaDialog'
import { BloqueoDialog } from './BloqueoDialog'
import { FiltrosProfesional } from './FiltrosProfesional'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, Ban } from 'lucide-react'
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
  const [horarios, setHorarios] = useState<Record<string, Horario[]>>({})
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [modoBloqueo, setModoBloqueo] = useState(false)
  const [bloqueoDialogOpen, setBloqueoDialogOpen] = useState(false)
  const [selectedBloqueo, setSelectedBloqueo] = useState<Bloqueo | null>(null)
  const [bloqueoDefaultStart, setBloqueoDefaultStart] = useState<string | undefined>()
  const [bloqueoDefaultEnd, setBloqueoDefaultEnd] = useState<string | undefined>()

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

    // Fetch bloqueos
    const { data: bloqueosData } = await supabase
      .from('bloqueos')
      .select('*')
      .order('fecha_inicio')
    if (bloqueosData) setBloqueos(bloqueosData)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('citas-bloqueos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData, supabase])

  const filteredProfesionales = profesionales.filter((p) => filtrosProfesional.includes(p.id))

  function handleSlotClick(profesionalId: string, start: Date, end: Date) {
    if (modoBloqueo) {
      // Open bloqueo dialog
      setSelectedBloqueo(null)
      setSelectedProfesionalId(profesionalId)
      setBloqueoDefaultStart(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`)
      setBloqueoDefaultEnd(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`)
      setBloqueoDialogOpen(true)
    } else {
      setSelectedCita(null)
      setSelectedDate({ start, end })
      setSelectedProfesionalId(profesionalId)
      setDialogOpen(true)
    }
  }

  function handleCitaClick(cita: CitaConRelaciones) {
    setSelectedCita(cita)
    setSelectedDate(null)
    setSelectedProfesionalId(null)
    setDialogOpen(true)
  }

  function handleBloqueoClick(bloqueo: Bloqueo) {
    setSelectedBloqueo(bloqueo)
    setSelectedProfesionalId(bloqueo.profesional_id)
    setBloqueoDialogOpen(true)
  }

  async function handleCitaDrop(citaId: string, newStart: Date, newEnd: Date) {
    const { error } = await supabase
      .from('citas')
      .update({
        fecha_inicio: newStart.toISOString(),
        fecha_fin: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', citaId)
    if (error) {
      toast.error('Error al mover la cita')
    } else {
      toast.success('Cita movida')
      fetchData()
    }
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setSelectedCita(null)
    setSelectedDate(null)
    setSelectedProfesionalId(null)
    fetchData()
  }

  function handleBloqueoDialogClose() {
    setBloqueoDialogOpen(false)
    setSelectedBloqueo(null)
    setSelectedProfesionalId(null)
    fetchData()
  }

  const isToday =
    fecha.toDateString() === new Date().toDateString()

  const fechaLabel = format(fecha, "EEEE d/MM/yy", { locale: es })

  const profNombre = profesionales.find((p) => p.id === selectedProfesionalId)?.nombre || ''

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
            variant={modoBloqueo ? 'destructive' : 'outline'}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setModoBloqueo(!modoBloqueo)}
          >
            <Ban className="h-3.5 w-3.5" />
            Bloquear
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

      {modoBloqueo && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Modo bloqueo activo: hacé click en un horario vacío para bloquearlo. Click en &quot;Bloquear&quot; para desactivar.
        </div>
      )}

      {/* Resource day view */}
      {filteredProfesionales.length > 0 ? (
        <CalendarioResourceDayView
          fecha={fecha}
          citas={citas}
          profesionales={filteredProfesionales}
          bloqueos={bloqueos}
          horarios={horarios}
          onSlotClick={handleSlotClick}
          onCitaClick={handleCitaClick}
          onBloqueoClick={handleBloqueoClick}
          onCitaDrop={handleCitaDrop}
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

      <BloqueoDialog
        open={bloqueoDialogOpen}
        onClose={handleBloqueoDialogClose}
        bloqueo={selectedBloqueo}
        profesionalId={selectedProfesionalId}
        profesionalNombre={profNombre}
        fecha={fecha}
        defaultStart={bloqueoDefaultStart}
        defaultEnd={bloqueoDefaultEnd}
      />
    </div>
  )
}
