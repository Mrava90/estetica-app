'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional, Horario, Bloqueo, Desbloqueo } from '@/types/database'
import { CalendarioResourceDayView } from './CalendarioResourceDayView'
import { CitaDialog } from './CitaDialog'
import { CitaDetailPanel } from './CitaDetailPanel'
import { BloqueoDialog } from './BloqueoDialog'
import { RecordatoriosDialog } from './RecordatoriosDialog'
import { ReenganchesDialog } from './ReenganchesDialog'
import { FiltrosProfesional } from './FiltrosProfesional'
import { ImportarTurnosDialog } from './ImportarTurnosDialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, Ban, MessageCircle, Sparkles, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { isAdminUser } from '@/lib/constants'

export function CalendarioView() {
  const [fecha, setFecha] = useState<Date>(new Date())
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [filtrosProfesional, setFiltrosProfesional] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedCita, setSelectedCita] = useState<CitaConRelaciones | null>(null)
  const [selectedDate, setSelectedDate] = useState<{ start: Date; end: Date } | null>(null)
  const [selectedProfesionalId, setSelectedProfesionalId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [horarios, setHorarios] = useState<Record<string, Horario[]>>({})
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [desbloqueos, setDesbloqueos] = useState<Desbloqueo[]>([])
  const [modoBloqueo, setModoBloqueo] = useState(false)
  const [bloqueoDialogOpen, setBloqueoDialogOpen] = useState(false)
  const [selectedBloqueo, setSelectedBloqueo] = useState<Bloqueo | null>(null)
  const [selectedDesbloqueo, setSelectedDesbloqueo] = useState<Desbloqueo | null>(null)
  const [bloqueoDefaultStart, setBloqueoDefaultStart] = useState<string | undefined>()
  const [bloqueoDefaultEnd, setBloqueoDefaultEnd] = useState<string | undefined>()
  const [recordatoriosOpen, setRecordatoriosOpen] = useState(false)
  const [recordatoriosPendientes, setRecordatoriosPendientes] = useState(0)
  const [reenganchesOpen, setReenganchesOpen] = useState(false)
  const [reenganchesPendientes, setReenganchesPendientes] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Mobile
  const [isMobile, setIsMobile] = useState(false)
  const [mobileProfId, setMobileProfId] = useState<string | null>(null)
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null)

  // Dialogo de importacion masiva de turnos por CSV
  const [turnosDialogOpen, setTurnosDialogOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (profesionales.length > 0 && !mobileProfId) {
      setMobileProfId(profesionales[0].id)
    }
  }, [profesionales]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null
      setUserEmail(email)
      if (isAdminUser(data.user)) setIsAdmin(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecordatoriosPendientes = useCallback(async () => {
    const hoy = new Date()
    const hoyStr = format(hoy, 'yyyy-MM-dd')
    const inicio = `${hoyStr}T00:00:00`
    const fin = `${hoyStr}T23:59:59`

    const { data } = await supabase
      .from('citas')
      .select('id, recordatorio_whatsapp_enviado')
      .in('status', ['pendiente', 'confirmada'])
      .gte('fecha_inicio', inicio)
      .lte('fecha_inicio', fin)
      .lt('created_at', inicio) // excluir turnos agendados el mismo día

    const pendientes = (data || []).filter(
      (c) => !(c as unknown as Record<string, unknown>).recordatorio_whatsapp_enviado
    ).length
    setRecordatoriosPendientes(pendientes > 0 ? pendientes : 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReenganchesPendientes = useCallback(async () => {
    try {
      const res = await fetch('/api/reenganches')
      if (!res.ok) return
      const data = await res.json()
      setReenganchesPendientes((data.items || []).length)
    } catch {}
  }, [])

  const fetchData = useCallback(async () => {
    // Ventana de 60 días atrás y 90 días adelante — cubre todo el uso normal
    const desde = new Date(); desde.setDate(desde.getDate() - 60)
    const hasta = new Date(); hasta.setDate(hasta.getDate() + 90)
    const desdeStr = desde.toISOString().split('T')[0]
    const hastaStr = hasta.toISOString().split('T')[0]

    const [citasRes, profRes, bloqueosRes, desbloqueosRes] = await Promise.all([
      supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .in('status', ['pendiente', 'confirmada'])
        .gte('fecha_inicio', `${desdeStr}T00:00:00`)
        .lte('fecha_inicio', `${hastaStr}T23:59:59`)
        .order('fecha_inicio'),
      supabase.from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).order('nombre'),
      supabase.from('bloqueos').select('*')
        .gte('fecha_inicio', `${desdeStr}T00:00:00`)
        .lte('fecha_inicio', `${hastaStr}T23:59:59`)
        .order('fecha_inicio'),
      supabase.from('desbloqueos').select('*')
        .gte('fecha', desdeStr)
        .lte('fecha', hastaStr)
        .order('fecha'),
    ])

    if (citasRes.data) setCitas(citasRes.data)
    if (bloqueosRes.data) setBloqueos(bloqueosRes.data)
    if (desbloqueosRes.data) setDesbloqueos(desbloqueosRes.data)

    if (profRes.data) {
      setProfesionales(profRes.data)
      if (filtrosProfesional.length === 0) {
        setFiltrosProfesional(profRes.data.map((p) => p.id))
      }
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
    fetchRecordatoriosPendientes()
    fetchReenganchesPendientes()

    const channel = supabase
      .channel('citas-bloqueos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desbloqueos' }, () => {
        fetchData()
      })
      .subscribe()

    // Polling de respaldo cada 30s por si Realtime no está activo
    const interval = setInterval(() => {
      fetchData()
      fetchRecordatoriosPendientes()
      fetchReenganchesPendientes()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchData, fetchRecordatoriosPendientes, supabase])

  // Si el usuario logueado tiene email que coincide con un profesional → modo solo-lectura
  const myProfesional = (!isAdmin && userEmail)
    ? profesionales.find((p) => p.email === userEmail) ?? null
    : null
  const isReadOnly = !!myProfesional

  const filteredProfesionales = profesionales.filter((p) => filtrosProfesional.includes(p.id))
  const effectiveFiltrados = isReadOnly
    ? [myProfesional!]
    : isMobile
      ? profesionales.filter((p) => p.id === mobileProfId)
      : filteredProfesionales

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
    if (isReadOnly) {
      setDetailOpen(true)
    } else {
      setDialogOpen(true)
    }
  }

  function handleEditFromDetail() {
    setDetailOpen(false)
    setDialogOpen(true)
  }

  function handleDetailClose() {
    setDetailOpen(false)
    setSelectedCita(null)
    fetchData()
  }

  function handleBloqueoClick(bloqueo: Bloqueo) {
    setSelectedBloqueo(bloqueo)
    setSelectedDesbloqueo(null)
    setSelectedProfesionalId(bloqueo.profesional_id)
    setBloqueoDialogOpen(true)
  }

  function handleDesbloqueoClick(desbloqueo: Desbloqueo) {
    setSelectedDesbloqueo(desbloqueo)
    setSelectedBloqueo(null)
    setSelectedProfesionalId(desbloqueo.profesional_id)
    setBloqueoDialogOpen(true)
  }

  async function handleCitaDrop(citaId: string, newStart: Date, newEnd: Date, newProfesionalId: string) {
    const { error } = await supabase
      .from('citas')
      .update({
        fecha_inicio: newStart.toISOString(),
        fecha_fin: newEnd.toISOString(),
        profesional_id: newProfesionalId,
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

  function handleDialogClose(newDate?: Date) {
    setDialogOpen(false)
    setSelectedCita(null)
    setSelectedDate(null)
    setSelectedProfesionalId(null)
    if (newDate) setFecha(newDate)
    fetchData()
  }

  function handleBloqueoDialogClose() {
    setBloqueoDialogOpen(false)
    setSelectedBloqueo(null)
    setSelectedDesbloqueo(null)
    setSelectedProfesionalId(null)
    fetchData()
  }

  const isToday =
    fecha.toDateString() === new Date().toDateString()

  const fechaLabel = format(fecha, "EEEE d/MM/yy", { locale: es })

  const profNombre = profesionales.find((p) => p.id === selectedProfesionalId)?.nombre || ''

  return (
    <div className="space-y-3">
      {/* Title — desktop only */}
      <h1 className="hidden sm:block text-2xl font-bold capitalize">Calendario — {fechaLabel}</h1>

      {/* ── MOBILE HEADER ── */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setFecha(subDays(fecha, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="flex-1 text-center">
                <div className="text-lg font-bold capitalize leading-tight">{fechaLabel}</div>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar mode="single" selected={fecha} onSelect={(d) => { if (d) { setFecha(d); setCalendarOpen(false) } }} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setFecha(addDays(fecha, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {/* Professional tabs — single select on mobile (hidden in read-only mode) */}
        {!isReadOnly && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {profesionales.map(prof => (
              <button
                key={prof.id}
                onClick={() => setMobileProfId(prof.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                  mobileProfId === prof.id ? 'text-white border-transparent' : 'border-border bg-card text-muted-foreground'
                )}
                style={mobileProfId === prof.id ? { backgroundColor: prof.color } : undefined}
              >
                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: prof.color }} />
                {prof.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              className="relative gap-1.5 text-xs flex-1"
              onClick={() => setRecordatoriosOpen(true)}
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" />
              Recordatorios
              {recordatoriosPendientes > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold text-white">
                  {recordatoriosPendientes}
                </span>
              )}
            </Button>
          )}
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              className="relative gap-1.5 text-xs flex-1"
              onClick={() => setReenganchesOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
              Reenganche
              {reenganchesPendientes > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold text-white">
                  {reenganchesPendientes}
                </span>
              )}
            </Button>
          )}
          {!isReadOnly && (
            <Button
              variant={modoBloqueo ? 'destructive' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs flex-1"
              onClick={() => setModoBloqueo(!modoBloqueo)}
            >
              <Ban className="h-3.5 w-3.5" />
              Bloquear
            </Button>
          )}
          {!isToday && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFecha(new Date())}>
              Hoy
            </Button>
          )}
        </div>
      </div>

      {/* ── DESKTOP HEADER ── */}
      <div className="hidden sm:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          {!isReadOnly && (
            <>
              <Button
                variant={modoBloqueo ? 'destructive' : 'outline'}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setModoBloqueo(!modoBloqueo)}
              >
                <Ban className="h-3.5 w-3.5" />
                Bloquear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="relative gap-1.5 text-xs"
                onClick={() => setRecordatoriosOpen(true)}
              >
                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                Recordatorios
                {recordatoriosPendientes > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold text-white">
                    {recordatoriosPendientes}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="relative gap-1.5 text-xs"
                onClick={() => setReenganchesOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                Reenganche
                {reenganchesPendientes > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold text-white">
                    {reenganchesPendientes}
                  </span>
                )}
              </Button>
            </>
          )}
          {!isToday && (
            <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setFecha(new Date())}>
              Hoy
            </Button>
          )}
        </div>
        {!isReadOnly && (
          <FiltrosProfesional
            profesionales={profesionales}
            activos={filtrosProfesional}
            onChange={setFiltrosProfesional}
          />
        )}
      </div>

      {modoBloqueo && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Modo bloqueo activo: hacé click en un horario vacío para bloquearlo. Click en &quot;Bloquear&quot; para desactivar.
        </div>
      )}

      {/* Resource day view */}
      {effectiveFiltrados.length > 0 ? (
        <div
          onTouchStart={isMobile && !isReadOnly ? (e) => {
            swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
          } : undefined}
          onTouchEnd={isMobile && !isReadOnly ? (e) => {
            if (!swipeRef.current) return
            const dx = e.changedTouches[0].clientX - swipeRef.current.x
            const dy = e.changedTouches[0].clientY - swipeRef.current.y
            const dt = Date.now() - swipeRef.current.t
            swipeRef.current = null
            // Solo swipe horizontal rápido (no long press, no scroll vertical)
            if (dt > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            const idx = profesionales.findIndex(p => p.id === mobileProfId)
            if (idx === -1) return
            if (dx < 0 && idx < profesionales.length - 1) setMobileProfId(profesionales[idx + 1].id)
            if (dx > 0 && idx > 0) setMobileProfId(profesionales[idx - 1].id)
          } : undefined}
        >
        <CalendarioResourceDayView
          fecha={fecha}
          citas={citas}
          profesionales={effectiveFiltrados}
          bloqueos={bloqueos}
          desbloqueos={desbloqueos}
          horarios={horarios}
          onSlotClick={isReadOnly ? () => {} : handleSlotClick}
          onCitaClick={handleCitaClick}
          onBloqueoClick={isReadOnly ? undefined : handleBloqueoClick}
          onDesbloqueoClick={isReadOnly ? undefined : handleDesbloqueoClick}
          onCitaDrop={isReadOnly ? undefined : handleCitaDrop}
        />
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          Seleccioná al menos un profesional para ver el calendario.
        </div>
      )}

      <CitaDetailPanel
        open={detailOpen}
        cita={selectedCita}
        onClose={handleDetailClose}
        onEdit={isReadOnly ? undefined : handleEditFromDetail}
        readOnly={isReadOnly}
      />

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
        desbloqueo={selectedDesbloqueo}
        profesionalId={selectedProfesionalId}
        profesionalNombre={profNombre}
        fecha={fecha}
        defaultStart={bloqueoDefaultStart}
        defaultEnd={bloqueoDefaultEnd}
        horarios={Object.values(horarios).flat()}
      />

      <RecordatoriosDialog
        open={recordatoriosOpen}
        fecha={fecha}
        onClose={() => {
          setRecordatoriosOpen(false)
          fetchRecordatoriosPendientes()
        }}
      />

      <ReenganchesDialog
        open={reenganchesOpen}
        onClose={() => {
          setReenganchesOpen(false)
          fetchReenganchesPendientes()
        }}
      />

      {/* Importar turnos desde CSV */}
      <ImportarTurnosDialog
        open={turnosDialogOpen}
        onOpenChange={setTurnosDialogOpen}
        onImportado={fetchData}
      />
      {/* FAB mobile — nuevo turno (oculto en modo solo-lectura) */}
      {!isReadOnly && (
        <button
          className="fixed bottom-6 right-6 sm:hidden z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          onClick={() => {
            setSelectedCita(null)
            setSelectedDate(null)
            setSelectedProfesionalId(mobileProfId)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
