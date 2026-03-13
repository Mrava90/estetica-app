'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import type { CitaConRelaciones, Profesional, Bloqueo, Horario } from '@/types/database'
import { STATUS_COLORS } from '@/lib/constants'
import { formatPrecio } from '@/lib/dates'
import { Clock } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  mercadopago: 'MercadoPago',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
}

const HORA_INICIO = 8
const HORA_FIN = 21
const HORA_HEIGHT = 88
const SLOT_MINUTOS = 15        // resolución para drag-drop
const SLOT_CLICK_MINUTOS = 15  // resolución para click/hover de nuevo turno

interface Props {
  fecha: Date
  citas: CitaConRelaciones[]
  profesionales: Profesional[]
  bloqueos?: Bloqueo[]
  horarios?: Record<string, Horario[]>
  onSlotClick: (profesionalId: string, start: Date, end: Date) => void
  onCitaClick: (cita: CitaConRelaciones) => void
  onBloqueoClick?: (bloqueo: Bloqueo) => void
  onCitaDrop?: (citaId: string, newStart: Date, newEnd: Date, newProfesionalId: string) => void
}

export function CalendarioResourceDayView({
  fecha,
  citas,
  profesionales,
  bloqueos = [],
  horarios = {},
  onSlotClick,
  onCitaClick,
  onBloqueoClick,
  onCitaDrop,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const nowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ citaId: string; offsetMinutes: number; duration: number } | null>(null)
  const hasDraggedRef = useRef(false)
  const preventNextClickRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dropPreview, setDropPreview] = useState<{ profId: string; top: number; height: number } | null>(null)

  // Hover tooltip sobre cita existente
  const [hoveredCita, setHoveredCita] = useState<CitaConRelaciones | null>(null)
  const [tooltipAnchor, setTooltipAnchor] = useState<DOMRect | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hover highlight de slot vacío (15 min)
  type HoverSlot = { profId: string; top: number; startLabel: string; endLabel: string }
  const [hoverSlot, setHoverSlot] = useState<HoverSlot | null>(null)

  // Refs to column DOM elements keyed by profId
  const colRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())

  // Keep refs to avoid stale closures – updated on every render
  const fechaRef = useRef(fecha)
  const onCitaDropRef = useRef(onCitaDrop)
  useEffect(() => { fechaRef.current = fecha }, [fecha])
  useEffect(() => { onCitaDropRef.current = onCitaDrop }, [onCitaDrop])

  // Cleanup drag listeners on unmount
  const cleanupDragRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { cleanupDragRef.current?.() }, [])

  const timeSlots = useMemo(() => {
    const slots: number[] = []
    for (let h = HORA_INICIO; h < HORA_FIN; h++) {
      slots.push(h)
    }
    return slots
  }, [])

  const citasPorProfesional = useMemo(() => {
    const map = new Map<string, CitaConRelaciones[]>()
    profesionales.forEach((p) => map.set(p.id, []))
    citas.forEach((c) => {
      if (c.profesional_id && map.has(c.profesional_id)) {
        const citaDate = new Date(c.fecha_inicio)
        if (
          citaDate.getFullYear() === fecha.getFullYear() &&
          citaDate.getMonth() === fecha.getMonth() &&
          citaDate.getDate() === fecha.getDate()
        ) {
          map.get(c.profesional_id)!.push(c)
        }
      }
    })
    return map
  }, [citas, profesionales, fecha])

  const colsMapPorProfesional = useMemo(() => {
    const result = new Map<string, Map<string, { col: number; totalCols: number }>>()
    citasPorProfesional.forEach((citasProf, profId) => {
      result.set(profId, getCitaColumns(citasProf))
    })
    return result
  }, [citasPorProfesional])

  const bloqueosPorProfesional = useMemo(() => {
    const map = new Map<string, Bloqueo[]>()
    profesionales.forEach((p) => map.set(p.id, []))
    bloqueos.forEach((b) => {
      if (map.has(b.profesional_id)) {
        const bDate = new Date(b.fecha_inicio)
        if (
          bDate.getFullYear() === fecha.getFullYear() &&
          bDate.getMonth() === fecha.getMonth() &&
          bDate.getDate() === fecha.getDate()
        ) {
          map.get(b.profesional_id)!.push(b)
        }
      }
    })
    return map
  }, [bloqueos, profesionales, fecha])

  // Scroll to current time or 9:00 on load
  useEffect(() => {
    const now = new Date()
    const isToday =
      now.getFullYear() === fecha.getFullYear() &&
      now.getMonth() === fecha.getMonth() &&
      now.getDate() === fecha.getDate()

    if (gridRef.current) {
      if (isToday && nowRef.current) {
        nowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else {
        const offset = (9 - HORA_INICIO) * HORA_HEIGHT
        gridRef.current.scrollTop = offset
      }
    }
  }, [fecha])

  // Find which column the cursor is in by comparing clientX against bounding rects
  function getColAt(clientX: number): { profId: string; el: HTMLDivElement } | null {
    for (const [profId, el] of colRefsMap.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        return { profId, el }
      }
    }
    return null
  }

  // Calculate drop time from column element and clientY
  function calcDropPosition(colEl: HTMLElement, clientY: number) {
    const drag = dragRef.current!
    const rect = colEl.getBoundingClientRect()
    const y = clientY - rect.top
    const minutesFromGridTop = (y / HORA_HEIGHT) * 60 - drag.offsetMinutes
    const snapped = Math.round(minutesFromGridTop / SLOT_MINUTOS) * SLOT_MINUTOS
    const clamped = Math.max(0, Math.min(snapped, (HORA_FIN - HORA_INICIO) * 60 - SLOT_MINUTOS))
    const top = (clamped / 60) * HORA_HEIGHT
    const height = (drag.duration / 60) * HORA_HEIGHT
    const totalStartMinutes = HORA_INICIO * 60 + clamped
    return { top, height, totalStartMinutes }
  }

  function handleCitaPointerDown(cita: CitaConRelaciones, e: React.PointerEvent) {
    if (e.button !== 0) return

    const isTouch = e.pointerType === 'touch'
    // On desktop prevent default (text selection etc). On touch let browser handle scroll until drag activates.
    if (!isTouch) e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)

    const start = new Date(cita.fecha_inicio)
    const end = new Date(cita.fecha_fin)
    const duration = (end.getTime() - start.getTime()) / 60000

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetMinutes = ((e.clientY - rect.top) / HORA_HEIGHT) * 60

    hasDraggedRef.current = false
    let dragActive = false

    const startX = e.clientX
    const startY = e.clientY
    // Position captured when long press fires – used to measure movement after activation
    let longPressX = startX
    let longPressY = startY

    cleanupDragRef.current?.()

    let longPressTimer: ReturnType<typeof setTimeout> | null = null

    if (isTouch) {
      // Track latest finger position so we can record where long press fired
      let latestX = startX
      let latestY = startY
      function trackLatest(ev: PointerEvent) { latestX = ev.clientX; latestY = ev.clientY }
      window.addEventListener('pointermove', trackLatest, { passive: true })

      // Long press: activate drag after 3000 ms without significant movement
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        window.removeEventListener('pointermove', trackLatest)
        longPressX = latestX
        longPressY = latestY
        dragRef.current = { citaId: cita.id, offsetMinutes, duration }
        dragActive = true
        // hasDraggedRef stays false — real drag requires deliberate movement after long press
        setIsDragging(true)  // visual feedback (opacity + cursor)
        if (navigator.vibrate) navigator.vibrate(50)
      }, 3000)
    } else {
      // Desktop: drag-ready immediately, activates after 5 px movement
      dragRef.current = { citaId: cita.id, offsetMinutes, duration }
      dragActive = true
    }

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (isTouch && !dragActive) {
        // Cancel long press if finger moves > 12 px before activation (user is scrolling)
        if (dist > 12) {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
          preventNextClickRef.current = true
          setTimeout(() => { preventNextClickRef.current = false }, 500)
          cleanup()
        }
        return
      }

      if (!dragRef.current) return
      if (!hasDraggedRef.current) {
        // For touch: require 10 px from where the long press fired (deliberate drag intent)
        // For mouse: require 5 px from original position
        if (isTouch) {
          const ldx = ev.clientX - longPressX
          const ldy = ev.clientY - longPressY
          if (Math.sqrt(ldx * ldx + ldy * ldy) < 10) return
        } else {
          if (dist < 5) return
        }
        hasDraggedRef.current = true
        setIsDragging(true)
      }
      const col = getColAt(ev.clientX)
      if (!col) { setDropPreview(null); return }
      const { top, height } = calcDropPosition(col.el, ev.clientY)
      setDropPreview({ profId: col.profId, top, height })
    }

    function onUp(ev: PointerEvent) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      if (!dragRef.current) {
        cleanup()
        return
      }
      const didDrag = hasDraggedRef.current
      if (didDrag && onCitaDropRef.current) {
        const col = getColAt(ev.clientX)
        if (col) {
          const { totalStartMinutes } = calcDropPosition(col.el, ev.clientY)
          const newStart = new Date(fechaRef.current)
          newStart.setHours(Math.floor(totalStartMinutes / 60), totalStartMinutes % 60, 0, 0)
          const newEnd = new Date(newStart.getTime() + dragRef.current.duration * 60000)
          onCitaDropRef.current(dragRef.current.citaId, newStart, newEnd, col.profId)
        }
      }
      // Suprimir el click que el browser dispara después del pointerup
      if (didDrag) {
        preventNextClickRef.current = true
        setTimeout(() => { preventNextClickRef.current = false }, 500)
      }
      dragRef.current = null
      hasDraggedRef.current = false
      setIsDragging(false)
      setDropPreview(null)
      cleanup()
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      cleanupDragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    cleanupDragRef.current = cleanup
  }

  function handleGridClick(profesionalId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (isDragging) return
    if (preventNextClickRef.current) return
    if ((e.target as HTMLElement).closest('[data-cita]')) return
    const col = colRefsMap.current.get(profesionalId)
    if (!col) return
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromStart = (y / HORA_HEIGHT) * 60
    const slotMinutes = Math.floor(minutesFromStart / SLOT_CLICK_MINUTOS) * SLOT_CLICK_MINUTOS
    const totalMinutes = HORA_INICIO * 60 + slotMinutes

    const start = new Date(fecha)
    start.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + SLOT_CLICK_MINUTOS)

    onSlotClick(profesionalId, start, end)
  }

  function handleColMouseMove(profId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (isDragging) { setHoverSlot(null); return }
    if ((e.target as HTMLElement).closest('[data-cita]')) { setHoverSlot(null); return }
    const col = colRefsMap.current.get(profId)
    if (!col) return
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromStart = (y / HORA_HEIGHT) * 60
    const slotMinutes = Math.floor(minutesFromStart / SLOT_CLICK_MINUTOS) * SLOT_CLICK_MINUTOS
    const clamped = Math.max(0, Math.min(slotMinutes, (HORA_FIN - HORA_INICIO) * 60 - SLOT_CLICK_MINUTOS))
    const top = (clamped / 60) * HORA_HEIGHT
    const totalMinutes = HORA_INICIO * 60 + clamped
    const p = (n: number) => String(n).padStart(2, '0')
    const h1 = Math.floor(totalMinutes / 60)
    const m1 = totalMinutes % 60
    const endTotal = totalMinutes + SLOT_CLICK_MINUTOS
    const h2 = Math.floor(endTotal / 60)
    const m2 = endTotal % 60
    setHoverSlot({ profId, top, startLabel: `${p(h1)}:${p(m1)}`, endLabel: `${p(h2)}:${p(m2)}` })
  }

  function handleColMouseLeave() {
    setHoverSlot(null)
  }

  function handleCitaHoverEnter(cita: CitaConRelaciones, e: React.MouseEvent) {
    if (isDragging) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      setHoveredCita(cita)
      setTooltipAnchor(rect)
    }, 250)
  }

  function handleCitaHoverLeave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHoveredCita(null)
    setTooltipAnchor(null)
  }

  function getTooltipStyle(anchor: DOMRect): React.CSSProperties {
    const W = 260
    let x = anchor.right + 10
    if (x + W > window.innerWidth) x = anchor.left - W - 10
    let y = anchor.top
    if (y + 200 > window.innerHeight) y = window.innerHeight - 208
    return { position: 'fixed', left: Math.max(8, x), top: Math.max(8, y), width: W, zIndex: 200 }
  }

  function formatTime(date: Date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  // Now indicator
  const now = new Date()
  const isToday =
    now.getFullYear() === fecha.getFullYear() &&
    now.getMonth() === fecha.getMonth() &&
    now.getDate() === fecha.getDate()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = ((nowMinutes - HORA_INICIO * 60) / 60) * HORA_HEIGHT
  const showNow = isToday && nowMinutes >= HORA_INICIO * 60 && nowMinutes <= HORA_FIN * 60

  const totalHeight = (HORA_FIN - HORA_INICIO) * HORA_HEIGHT

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  function getAvailability(profId: string) {
    const profHorarios = horarios[profId] || []
    const diaSemana = fecha.getDay()
    const horarioHoy = profHorarios.find((h) => h.dia_semana === diaSemana)
    if (!horarioHoy) return null

    const profCitas = citasPorProfesional.get(profId) || []
    const profBloqs = bloqueosPorProfesional.get(profId) || []

    const workStart = toMin(horarioHoy.hora_inicio)
    const workEnd = toMin(horarioHoy.hora_fin)

    const occupied = [
      ...profCitas.map((c) => {
        const s = new Date(c.fecha_inicio)
        const e = new Date(c.fecha_fin)
        return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() }
      }),
      ...profBloqs.map((b) => {
        const s = new Date(b.fecha_inicio)
        const e = new Date(b.fecha_fin)
        return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() }
      }),
    ].sort((a, b) => a.start - b.start)

    const freeSlots: { start: number; end: number }[] = []
    let cursor = workStart

    if (isToday) {
      const nowRounded = Math.ceil(nowMinutes / 30) * 30
      if (nowRounded > cursor) cursor = nowRounded
    }

    for (const occ of occupied) {
      if (occ.start > cursor) freeSlots.push({ start: cursor, end: occ.start })
      if (occ.end > cursor) cursor = occ.end
    }
    if (cursor < workEnd) freeSlots.push({ start: cursor, end: workEnd })

    return {
      workStart,
      workEnd,
      freeSlots: freeSlots.filter((s) => s.end - s.start >= 30),
    }
  }

  return (
    <div
      className="rounded-lg border bg-card overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100vh - 200px)', cursor: isDragging ? 'grabbing' : undefined }}
    >
      {/* Header */}
      <div className="flex border-b bg-muted/30 shrink-0">
        <div className="w-16 shrink-0 border-r" />
        {profesionales.map((prof) => {
          const count = citasPorProfesional.get(prof.id)?.length || 0
          const avail = getAvailability(prof.id)
          return (
            <div key={prof.id} className="flex-1 min-w-[180px] px-2 py-1.5 text-center border-r last:border-r-0">
              <div className="flex flex-wrap items-center justify-center gap-1 mb-1">
                {avail ? (
                  avail.freeSlots.length === 0 ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                      Sin disponibilidad
                    </span>
                  ) : (
                    avail.freeSlots.map((s, i) => (
                      <span key={i} className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:text-green-400 tabular-nums">
                        {fromMin(s.start)} – {fromMin(s.end)}
                      </span>
                    ))
                  )
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground italic">
                    No trabaja hoy
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <span className="inline-block h-6 w-6 rounded-full shrink-0" style={{ backgroundColor: prof.color }} />
                <span className="text-base font-semibold truncate">{prof.nombre}</span>
                {count > 0 && (
                  <span
                    className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full text-[10px] font-bold text-white px-1 shrink-0"
                    style={{ backgroundColor: prof.color }}
                  >
                    {count}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={gridRef} className="overflow-y-auto overflow-x-auto flex-1">
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Time column */}
          <div className="w-16 shrink-0 border-r relative bg-card">
            {timeSlots.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 pr-2 flex items-start justify-end"
                style={{ top: (hour - HORA_INICIO) * HORA_HEIGHT }}
              >
                <span className="text-[11px] text-muted-foreground -translate-y-1/2 font-medium">
                  {`${hour}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Professional columns */}
          {profesionales.map((prof) => (
            <div
              key={prof.id}
              ref={(el) => {
                if (el) colRefsMap.current.set(prof.id, el)
                else colRefsMap.current.delete(prof.id)
              }}
              className="flex-1 min-w-[180px] border-r last:border-r-0 relative"
              onClick={(e) => handleGridClick(prof.id, e)}
              onMouseMove={(e) => handleColMouseMove(prof.id, e)}
              onMouseLeave={handleColMouseLeave}
            >
              {/* Hour lines */}
              {timeSlots.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border pointer-events-none"
                  style={{ top: (hour - HORA_INICIO) * HORA_HEIGHT }}
                />
              ))}
              {/* Half hour lines */}
              {timeSlots.map((hour) => (
                <div
                  key={`${hour}-half`}
                  className="absolute left-0 right-0 border-t border-border/30 pointer-events-none"
                  style={{ top: (hour - HORA_INICIO) * HORA_HEIGHT + HORA_HEIGHT / 2 }}
                />
              ))}

              {/* Bloqueos */}
              {bloqueosPorProfesional.get(prof.id)?.map((bloqueo) => {
                const start = new Date(bloqueo.fecha_inicio)
                const end = new Date(bloqueo.fecha_fin)
                const startMinutes = start.getHours() * 60 + start.getMinutes()
                const endMinutes = end.getHours() * 60 + end.getMinutes()
                const top = ((startMinutes - HORA_INICIO * 60) / 60) * HORA_HEIGHT
                const height = Math.max(((endMinutes - startMinutes) / 60) * HORA_HEIGHT, 24)
                const isSmall = height < 40
                return (
                  <div
                    key={bloqueo.id}
                    data-cita
                    className="absolute left-1 right-1 rounded-md border border-dashed border-red-400 dark:border-red-600 bg-red-100/70 dark:bg-red-900/30 px-1.5 py-0.5 overflow-hidden cursor-pointer transition-colors z-[1]"
                    style={{ top: `${top}px`, height: `${height}px`, pointerEvents: isDragging ? 'none' : 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onBloqueoClick?.(bloqueo)
                    }}
                  >
                    {isSmall ? (
                      <p className="text-[12px] font-semibold text-red-600 dark:text-red-400 truncate leading-snug">Bloqueado</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-red-500 dark:text-red-400 leading-tight">
                          {formatTime(start)} - {formatTime(end)}
                        </p>
                        <p className="text-[13px] font-semibold text-red-600 dark:text-red-400 truncate leading-tight mt-0.5">
                          {bloqueo.motivo || 'Bloqueado'}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}

              {/* Citas */}
              {citasPorProfesional.get(prof.id)?.map((cita) => {
                const pos = getCitaPosition(cita)
                const start = new Date(cita.fecha_inicio)
                const end = new Date(cita.fecha_fin)
                const isSmall = pos.height < 40
                const isBeingDragged = isDragging && dragRef.current?.citaId === cita.id
                const colInfo = colsMapPorProfesional.get(prof.id)?.get(cita.id) ?? { col: 0, totalCols: 1 }
                const colWidth = 100 / colInfo.totalCols
                return (
                  <div
                    key={cita.id}
                    data-cita
                    onPointerDown={(e) => handleCitaPointerDown(cita, e)}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseEnter={(e) => handleCitaHoverEnter(cita, e)}
                    onMouseLeave={handleCitaHoverLeave}
                    className="absolute rounded-md border-l-[3px] bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 px-1.5 py-0.5 overflow-hidden transition-all z-[1] hover:z-[5] hover:shadow-lg hover:ring-2 hover:ring-fuchsia-500/40 shadow-sm select-none"
                    style={{
                      top: `${pos.top}px`,
                      height: `${pos.height}px`,
                      left: `calc(${colInfo.col * colWidth}% + 2px)`,
                      width: `calc(${colWidth}% - 4px)`,
                      borderLeftColor: prof.color,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      opacity: isBeingDragged ? 0.35 : 1,
                      pointerEvents: isDragging ? 'none' : 'auto',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!hasDraggedRef.current && !preventNextClickRef.current) {
                        handleCitaHoverLeave()
                        onCitaClick(cita)
                      }
                    }}
                  >
                    {isSmall ? (
                      <p className="text-[11px] font-medium truncate leading-snug">
                        {formatTime(start)} {cita.clientes ? (cita.clientes.apellido ? `${cita.clientes.nombre} ${cita.clientes.apellido}` : cita.clientes.nombre) : 'Sin cliente'} - {cita.servicios?.nombre || ''}
                      </p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {formatTime(start)} - {formatTime(end)}
                        </p>
                        <p className="text-xs font-medium truncate leading-tight mt-0.5">
                          {cita.clientes ? (cita.clientes.apellido ? `${cita.clientes.nombre} ${cita.clientes.apellido}` : cita.clientes.nombre) : 'Sin cliente'}
                        </p>
                        <p className="text-[11px] font-semibold truncate leading-tight">
                          {cita.servicios?.nombre || 'Sin servicio'}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}

              {/* Slot hover highlight (15 min) */}
              {hoverSlot && hoverSlot.profId === prof.id && !isDragging && (
                <div
                  className="absolute left-0.5 right-0.5 rounded bg-primary/8 border border-primary/20 pointer-events-none z-[2] flex items-center justify-center"
                  style={{
                    top: `${hoverSlot.top}px`,
                    height: `${(SLOT_CLICK_MINUTOS / 60) * HORA_HEIGHT}px`,
                  }}
                >
                  <span className="text-[10px] text-primary/70 font-medium select-none">
                    {hoverSlot.startLabel} – {hoverSlot.endLabel}
                  </span>
                </div>
              )}

              {/* Drop preview */}
              {dropPreview && dropPreview.profId === prof.id && (
                <div
                  className="absolute left-1 right-1 rounded-md border-2 border-dashed border-fuchsia-500 bg-fuchsia-500/10 z-[3] pointer-events-none"
                  style={{ top: `${dropPreview.top}px`, height: `${dropPreview.height}px` }}
                />
              )}
            </div>
          ))}

          {/* Now indicator */}
          {showNow && (
            <div
              ref={nowRef}
              className="absolute left-14 right-0 z-[2] pointer-events-none flex items-center"
              style={{ top: `${nowTop}px` }}
            >
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-[5px]" />
              <div className="flex-1 border-t-2 border-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* ── Hover tooltip (position: fixed, fuera del scroll) ── */}
      {hoveredCita && tooltipAnchor && !isDragging && (
        <div
          className="bg-card border rounded-xl shadow-2xl pointer-events-none overflow-hidden text-sm"
          style={getTooltipStyle(tooltipAnchor)}
        >
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 border-b bg-muted/40">
            <p className="font-semibold text-foreground leading-tight truncate">
              {hoveredCita.clientes ? (hoveredCita.clientes.apellido ? `${hoveredCita.clientes.nombre} ${hoveredCita.clientes.apellido}` : hoveredCita.clientes.nombre) : 'Sin cliente'}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[hoveredCita.status] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABELS[hoveredCita.status] || hoveredCita.status}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="px-3 py-2.5 space-y-1.5 text-xs">
            <p className="text-foreground font-medium truncate">
              {hoveredCita.servicios?.nombre || 'Sin servicio'}
            </p>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatTime(new Date(hoveredCita.fecha_inicio))} – {formatTime(new Date(hoveredCita.fecha_fin))}</span>
              <span className="text-muted-foreground/50">
                ({Math.round((new Date(hoveredCita.fecha_fin).getTime() - new Date(hoveredCita.fecha_inicio).getTime()) / 60000)} min)
              </span>
            </div>

            {(hoveredCita.precio_cobrado != null || hoveredCita.metodo_pago) && (
              <div className="flex items-center justify-between pt-1.5 border-t">
                {hoveredCita.precio_cobrado != null ? (
                  <span className="font-semibold text-foreground text-sm">{formatPrecio(hoveredCita.precio_cobrado)}</span>
                ) : <span />}
                {hoveredCita.metodo_pago && (
                  <span className="text-muted-foreground">{METODO_LABELS[hoveredCita.metodo_pago] || hoveredCita.metodo_pago}</span>
                )}
              </div>
            )}

            {hoveredCita.notas && (
              <p className="text-muted-foreground line-clamp-2 leading-snug pt-1.5 border-t">
                {hoveredCita.notas}
              </p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/50 text-center pb-2 italic">Clic para ver detalle</p>
        </div>
      )}
    </div>
  )
}

function getCitaPosition(cita: CitaConRelaciones) {
  const start = new Date(cita.fecha_inicio)
  const end = new Date(cita.fecha_fin)
  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const endMinutes = end.getHours() * 60 + end.getMinutes()
  const top = ((startMinutes - HORA_INICIO * 60) / 60) * HORA_HEIGHT
  const height = ((endMinutes - startMinutes) / 60) * HORA_HEIGHT
  return { top, height: Math.max(height, 24) }
}

function getCitaColumns(citas: CitaConRelaciones[]): Map<string, { col: number; totalCols: number }> {
  const sorted = [...citas].sort(
    (a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
  )

  function overlaps(a: CitaConRelaciones, b: CitaConRelaciones) {
    return (
      new Date(a.fecha_inicio).getTime() < new Date(b.fecha_fin).getTime() &&
      new Date(b.fecha_inicio).getTime() < new Date(a.fecha_fin).getTime()
    )
  }

  // Assign greedy column slots
  const colMap = new Map<string, number>()
  const colEnds: number[] = []

  for (const cita of sorted) {
    const start = new Date(cita.fecha_inicio).getTime()
    let assigned = colEnds.findIndex((end) => end <= start)
    if (assigned === -1) assigned = colEnds.length
    colEnds[assigned] = new Date(cita.fecha_fin).getTime()
    colMap.set(cita.id, assigned)
  }

  // For each cita, totalCols = max col index among all overlapping citas + 1
  const result = new Map<string, { col: number; totalCols: number }>()
  for (const cita of sorted) {
    const group = sorted.filter((o) => overlaps(cita, o) || o.id === cita.id)
    const maxCol = Math.max(...group.map((o) => colMap.get(o.id) ?? 0))
    result.set(cita.id, { col: colMap.get(cita.id)!, totalCols: maxCol + 1 })
  }
  return result
}
