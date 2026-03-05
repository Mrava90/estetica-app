'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional, Horario, Bloqueo } from '@/types/database'
import { CalendarioResourceDayView } from './CalendarioResourceDayView'
import { CitaDialog } from './CitaDialog'
import { CitaDetailPanel } from './CitaDetailPanel'
import { BloqueoDialog } from './BloqueoDialog'
import { RecordatoriosDialog } from './RecordatoriosDialog'
import { FiltrosProfesional } from './FiltrosProfesional'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays, Ban, MessageCircle, CalendarPlus, Download, CheckCircle2, XCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { isAdminEmail } from '@/lib/constants'
import { formatPrecio } from '@/lib/dates'

interface TurnoRow {
  fecha: string
  hora_inicio: string
  hora_fin: string
  profesional_name: string
  profesional_id: string | null
  cliente_name: string
  servicio_name: string
  servicio_id: string | null
  monto: number
  metodo_pago: 'efectivo' | 'mercadopago' | 'transferencia'
  notas: string
  valid: boolean
  errorMsg?: string
}

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
  const [modoBloqueo, setModoBloqueo] = useState(false)
  const [bloqueoDialogOpen, setBloqueoDialogOpen] = useState(false)
  const [selectedBloqueo, setSelectedBloqueo] = useState<Bloqueo | null>(null)
  const [bloqueoDefaultStart, setBloqueoDefaultStart] = useState<string | undefined>()
  const [bloqueoDefaultEnd, setBloqueoDefaultEnd] = useState<string | undefined>()
  const [recordatoriosOpen, setRecordatoriosOpen] = useState(false)
  const [recordatoriosPendientes, setRecordatoriosPendientes] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)

  // CSV import turnos state
  const [turnosDialogOpen, setTurnosDialogOpen] = useState(false)
  const [turnosPreview, setTurnosPreview] = useState<TurnoRow[]>([])
  const [turnosImporting, setTurnosImporting] = useState(false)
  const [serviciosList, setServiciosList] = useState<string[]>([])
  const turnosInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (isAdminEmail(data.user?.email)) setIsAdmin(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (turnosDialogOpen && serviciosList.length === 0) {
      supabase.from('servicios').select('nombre').eq('activo', true).then(({ data }) => {
        if (data) setServiciosList(data.map((s) => s.nombre))
      })
    }
  }, [turnosDialogOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Turnos CSV import ───────────────────────────────────────
  async function parseTurnosCsv(text: string): Promise<TurnoRow[]> {
    const [profsRes, servsRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre').eq('activo', true),
      supabase.from('servicios').select('id, nombre, duracion_minutos, precio_efectivo, precio_mercadopago').eq('activo', true),
    ])
    const profs = profsRes.data || []
    const servs = servsRes.data || []

    function matchProf(name: string): string | null {
      const n = name.toLowerCase().trim()
      const found = profs.find((p) => {
        const pn = p.nombre.toLowerCase()
        return pn === n || pn.startsWith(n) || n.startsWith(pn.split(' ')[0])
      })
      return found?.id || null
    }

    function findServ(name: string) {
      const n = name.toLowerCase().trim()
      return servs.find((s) => s.nombre.toLowerCase().includes(n) || n.includes(s.nombre.toLowerCase())) || null
    }

    function mapMetodo(raw: string): 'efectivo' | 'mercadopago' | 'transferencia' {
      const r = raw.toLowerCase().trim()
      if (r.includes('mp') || r.includes('mercado')) return 'mercadopago'
      if (r.includes('trans')) return 'transferencia'
      return 'efectivo'
    }

    function addMinutes(hora: string, mins: number): string {
      const [h, m] = hora.split(':').map(Number)
      const total = h * 60 + m + mins
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
    const sep = lines[0]?.includes(';') ? ';' : ','
    const firstLower = lines[0]?.toLowerCase() || ''
    const hasHeader = firstLower.includes('fecha') || firstLower.includes('hora')
    const data = hasHeader ? lines.slice(1) : lines

    return data.map((line) => {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
      const fechaRaw = cols[0] || ''
      const hora_inicio = cols[1]?.trim() || ''
      const hora_fin_raw = cols[2]?.trim() || ''
      const profesional_name = cols[3]?.trim() || ''
      const cliente_name = cols[4]?.trim() || ''
      const servicio_name = cols[5]?.trim() || ''
      const montoRaw = cols[6] || ''
      const metodo_pagoRaw = cols[7] || ''
      const notas = cols[8]?.trim() || ''

      // Parse date DD/MM/YYYY
      let fecha = ''
      const parts = fechaRaw.split('/')
      if (parts.length === 3) {
        fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
        fecha = fechaRaw
      }

      const metodo_pago = mapMetodo(metodo_pagoRaw)
      const profesional_id = profesional_name ? matchProf(profesional_name) : null
      const matchedServ = servicio_name ? findServ(servicio_name) : null
      const servicio_id = matchedServ?.id || null

      // Auto-fill hora_fin from service duration if not provided
      const hora_fin = hora_fin_raw || (
        matchedServ && hora_inicio
          ? addMinutes(hora_inicio, matchedServ.duracion_minutos)
          : ''
      )

      // Auto-fill monto from service price if not provided
      const rawMonto = parseFloat(montoRaw.replace(/[$\s"]/g, '').replace(',', '.')) || 0
      const monto = rawMonto > 0 ? rawMonto : (
        matchedServ
          ? (metodo_pago === 'efectivo' ? matchedServ.precio_efectivo : matchedServ.precio_mercadopago)
          : 0
      )

      const valid = !!fecha && !!hora_inicio && !!profesional_name && !!profesional_id
      const errorMsg = !fecha
        ? 'Fecha inválida'
        : !hora_inicio
          ? 'Hora requerida'
          : !profesional_name
            ? 'Profesional requerido'
            : !profesional_id
              ? `Profesional "${profesional_name}" no encontrado`
              : undefined

      return {
        fecha,
        hora_inicio,
        hora_fin,
        profesional_name,
        profesional_id,
        cliente_name,
        servicio_name,
        servicio_id,
        monto,
        metodo_pago,
        notas,
        valid: valid && !!profesional_id,
        errorMsg,
      }
    })
  }

  async function handleTurnosFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = await parseTurnosCsv(text)
    setTurnosPreview(rows)
  }

  async function handleImportTurnos() {
    const validRows = turnosPreview.filter((r) => r.valid)
    if (validRows.length === 0) return
    setTurnosImporting(true)

    // ── Resolver / crear clientes ─────────────────────────────
    const clienteMap: Record<string, string> = {} // nombre.lower → id
    const uniqueNames = [...new Set(validRows.filter((r) => r.cliente_name).map((r) => r.cliente_name))]
    let clientesCreados = 0

    if (uniqueNames.length > 0) {
      // Buscar existentes por nombre exacto
      const { data: existing } = await supabase
        .from('clientes')
        .select('id, nombre')
        .in('nombre', uniqueNames)
      for (const c of existing || []) {
        clienteMap[c.nombre.toLowerCase()] = c.id
      }

      // Crear los que no se encontraron
      const toCreate = uniqueNames.filter((n) => !clienteMap[n.toLowerCase()])
      for (const nombre of toCreate) {
        const { data: created } = await supabase
          .from('clientes')
          .insert({ nombre, telefono: `sin-tel-${Math.random().toString(36).slice(2, 10)}` })
          .select('id')
          .single()
        if (created) {
          clienteMap[nombre.toLowerCase()] = created.id
          clientesCreados++
        }
      }
    }

    const citasToInsert = validRows.map((r) => {
      const fechaInicio = `${r.fecha}T${r.hora_inicio}:00-03:00`
      const fechaFin = r.hora_fin
        ? `${r.fecha}T${r.hora_fin}:00-03:00`
        : `${r.fecha}T${String(parseInt(r.hora_inicio.split(':')[0]) + 1).padStart(2, '0')}:${r.hora_inicio.split(':')[1]}:00-03:00`

      const cliente_id = r.cliente_name ? (clienteMap[r.cliente_name.toLowerCase()] ?? null) : null

      // Si el servicio no se matcheó pero hay nombre, lo guardamos en notas
      const servicioNotas = r.servicio_name && !r.servicio_id ? r.servicio_name : ''
      const notasFinal = [servicioNotas, r.notas].filter(Boolean).join(' | ') || null

      return {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        profesional_id: r.profesional_id,
        servicio_id: r.servicio_id,
        cliente_id,
        status: 'confirmada' as const,
        precio_cobrado: r.monto || null,
        metodo_pago: r.metodo_pago,
        notas: notasFinal,
        origen: 'manual' as const,
      }
    })

    const { error } = await supabase.from('citas').insert(citasToInsert)
    if (error) {
      toast.error('Error al importar: ' + error.message)
    } else {
      let msg = `${validRows.length} turno(s) importados`
      if (clientesCreados > 0) msg += ` · ${clientesCreados} cliente(s) nuevo(s) creados`
      toast.success(msg)
      setTurnosDialogOpen(false)
      setTurnosPreview([])
      if (turnosInputRef.current) turnosInputRef.current.value = ''
      fetchData()
    }
    setTurnosImporting(false)
  }

  const fetchRecordatoriosPendientes = useCallback(async () => {
    const manana = addDays(new Date(), 1)
    const mananaStr = format(manana, 'yyyy-MM-dd')
    const inicio = `${mananaStr}T00:00:00`
    const fin = `${mananaStr}T23:59:59`

    // Total de citas mañana con status activo
    const { data: citasManana } = await supabase
      .from('citas')
      .select('id')
      .in('status', ['pendiente', 'confirmada'])
      .gte('fecha_inicio', inicio)
      .lte('fecha_inicio', fin)

    if (!citasManana || citasManana.length === 0) {
      setRecordatoriosPendientes(0)
      return
    }

    const ids = citasManana.map((c) => c.id)

    // Cuántas ya tienen recordatorio enviado
    const { data: enviados } = await supabase
      .from('recordatorios')
      .select('cita_id')
      .eq('tipo', 'whatsapp')
      .eq('status', 'enviado')
      .in('cita_id', ids)

    const pendientes = citasManana.length - (enviados?.length ?? 0)
    setRecordatoriosPendientes(pendientes > 0 ? pendientes : 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    const [citasRes, profRes] = await Promise.all([
      supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .in('status', ['pendiente', 'confirmada'])
        .order('fecha_inicio'),
      supabase.from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).order('nombre'),
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
    fetchRecordatoriosPendientes()

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
  }, [fetchData, fetchRecordatoriosPendientes, supabase])

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
    setDetailOpen(true)
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
    setSelectedProfesionalId(bloqueo.profesional_id)
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
          {!isToday && (
            <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setFecha(new Date())}>
              Hoy
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setTurnosDialogOpen(true)}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Importar turnos
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

      <CitaDetailPanel
        open={detailOpen}
        cita={selectedCita}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
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
        profesionalId={selectedProfesionalId}
        profesionalNombre={profNombre}
        fecha={fecha}
        defaultStart={bloqueoDefaultStart}
        defaultEnd={bloqueoDefaultEnd}
      />

      <RecordatoriosDialog
        open={recordatoriosOpen}
        onClose={() => {
          setRecordatoriosOpen(false)
          fetchRecordatoriosPendientes()
        }}
      />

      {/* Dialog importar turnos CSV */}
      <Dialog open={turnosDialogOpen} onOpenChange={(open) => {
        setTurnosDialogOpen(open)
        if (!open) { setTurnosPreview([]); if (turnosInputRef.current) turnosInputRef.current.value = '' }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar turnos desde CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Download template */}
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="text-sm">
                <p className="font-medium">Plantilla de ejemplo</p>
                <p className="text-xs text-muted-foreground">
                  Columnas: fecha · hora_inicio · hora_fin · profesional · cliente · servicio · monto · metodo_pago · notas
                </p>
              </div>
              <a href="/templates/turnos-plantilla.csv" download>
                <Button variant="outline" size="sm" className="gap-2 shrink-0">
                  <Download className="h-4 w-4" />
                  Descargar plantilla
                </Button>
              </a>
            </div>

            <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-medium text-foreground">Separador:</span> punto y coma (;) — formato Excel Argentina</p>
              <p><span className="font-medium text-foreground">Fecha:</span> DD/MM/YYYY · <span className="font-medium text-foreground">Hora:</span> HH:MM (24h) · <span className="font-medium text-foreground">Método:</span> efectivo / mp / transferencia</p>
              <p><span className="font-medium text-foreground">Profesional:</span> nombre exacto o primeras letras (se mapea automáticamente)</p>
              {serviciosList.length > 0 && (
                <p>
                  <span className="font-medium text-foreground">Servicios disponibles:</span>{' '}
                  {serviciosList.join(' · ')}
                </p>
              )}
              <p className="pt-0.5 text-[11px] italic">Si un cliente no existe en la base se crea automáticamente.</p>
            </div>

            <div className="space-y-2">
              <Label>Seleccionar archivo CSV</Label>
              <input
                ref={turnosInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleTurnosFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
            </div>

            {turnosPreview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{turnosPreview.length} turnos detectados</span>
                  <span className="text-muted-foreground">
                    {turnosPreview.filter((r) => r.valid).length} válidos ·{' '}
                    {turnosPreview.filter((r) => !r.valid).length} con error
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Horario</TableHead>
                        <TableHead>Profesional</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Servicio</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turnosPreview.map((row, i) => (
                        <TableRow key={i} className={!row.valid ? 'bg-destructive/5' : ''}>
                          <TableCell className="min-w-[130px]">
                            {row.valid ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <span className="flex items-center gap-1 text-destructive">
                                <XCircle className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-[11px] leading-tight">{row.errorMsg}</span>
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{row.fecha || '—'}</TableCell>
                          <TableCell>{row.hora_inicio}{row.hora_fin ? `–${row.hora_fin}` : ''}</TableCell>
                          <TableCell className={!row.profesional_id ? 'text-destructive font-medium' : ''}>
                            {row.profesional_name || '—'}
                          </TableCell>
                          <TableCell>{row.cliente_name || '—'}</TableCell>
                          <TableCell className={row.servicio_name && !row.servicio_id ? 'text-amber-600 dark:text-amber-400' : ''}>
                            {row.servicio_name || '—'}
                            {row.servicio_name && !row.servicio_id && ' ⚠'}
                          </TableCell>
                          <TableCell className="text-right">{row.monto > 0 ? formatPrecio(row.monto) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {turnosPreview.some((r) => !r.valid) && (
                  <p className="text-xs text-muted-foreground">
                    Las filas con error se omitirán. Revisá los nombres de profesionales.
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={handleImportTurnos}
                  disabled={turnosImporting || turnosPreview.filter((r) => r.valid).length === 0}
                >
                  {turnosImporting
                    ? 'Importando...'
                    : `Importar ${turnosPreview.filter((r) => r.valid).length} turno(s)`}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
