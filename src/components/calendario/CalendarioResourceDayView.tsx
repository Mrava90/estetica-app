'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import type { CitaConRelaciones, Profesional, Bloqueo, Horario } from '@/types/database'
import { STATUS_COLORS } from '@/lib/constants'

const HORA_INICIO = 8
const HORA_FIN = 21
const HORA_HEIGHT = 64
const SLOT_MINUTOS = 30

interface Props {
  fecha: Date
  citas: CitaConRelaciones[]
  profesionales: Profesional[]
  bloqueos?: Bloqueo[]
  horarios?: Record<string, Horario[]>
  onSlotClick: (profesionalId: string, start: Date, end: Date) => void
  onCitaClick: (cita: CitaConRelaciones) => void
  onBloqueoClick?: (bloqueo: Bloqueo) => void
  onCitaDrop?: (citaId: string, newStart: Date, newEnd: Date) => void
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
  const [dropPreview, setDropPreview] = useState<{ profId: string; top: number; height: number } | null>(null)

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
        // Scroll to 9:00
        const offset = (9 - HORA_INICIO) * HORA_HEIGHT
        gridRef.current.scrollTop = offset
      }
    }
  }, [fecha])

  function getCitaPosition(cita: CitaConRelaciones) {
    const start = new Date(cita.fecha_inicio)
    const end = new Date(cita.fecha_fin)
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    const top = ((startMinutes - HORA_INICIO * 60) / 60) * HORA_HEIGHT
    const height = ((endMinutes - startMinutes) / 60) * HORA_HEIGHT
    return { top, height: Math.max(height, 24) }
  }

  function handleGridClick(profesionalId: string, e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-cita]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top + e.currentTarget.scrollTop
    const minutesFromStart = (y / HORA_HEIGHT) * 60
    const slotMinutes = Math.floor(minutesFromStart / SLOT_MINUTOS) * SLOT_MINUTOS
    const totalMinutes = HORA_INICIO * 60 + slotMinutes

    const start = new Date(fecha)
    start.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + SLOT_MINUTOS)

    onSlotClick(profesionalId, start, end)
  }

  function handleDragStart(cita: CitaConRelaciones, e: React.DragEvent) {
    const start = new Date(cita.fecha_inicio)
    const end = new Date(cita.fecha_fin)
    const duration = (end.getTime() - start.getTime()) / 60000

    // Calculate offset: where within the cita block the user grabbed
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const offsetMinutes = (offsetY / HORA_HEIGHT) * 60

    dragRef.current = { citaId: cita.id, offsetMinutes, duration }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', cita.id)
  }

  function handleDragOver(profId: string, e: React.DragEvent) {
    if (!dragRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = e.currentTarget.getBoundingClientRect()
    const scrollTop = e.currentTarget.scrollTop || 0
    const y = e.clientY - rect.top + scrollTop
    const minutesFromGridTop = (y / HORA_HEIGHT) * 60 - dragRef.current.offsetMinutes
    const snapped = Math.round(minutesFromGridTop / SLOT_MINUTOS) * SLOT_MINUTOS
    const top = (snapped / 60) * HORA_HEIGHT
    const height = (dragRef.current.duration / 60) * HORA_HEIGHT

    setDropPreview({ profId, top, height })
  }

  function handleDragLeave() {
    setDropPreview(null)
  }

  function handleDrop(profId: string, e: React.DragEvent) {
    e.preventDefault()
    setDropPreview(null)
    if (!dragRef.current || !onCitaDrop) return

    const rect = e.currentTarget.getBoundingClientRect()
    const scrollTop = e.currentTarget.scrollTop || 0
    const y = e.clientY - rect.top + scrollTop
    const minutesFromGridTop = (y / HORA_HEIGHT) * 60 - dragRef.current.offsetMinutes
    const snapped = Math.round(minutesFromGridTop / SLOT_MINUTOS) * SLOT_MINUTOS
    const totalStartMinutes = HORA_INICIO * 60 + snapped

    const newStart = new Date(fecha)
    newStart.setHours(Math.floor(totalStartMinutes / 60), totalStartMinutes % 60, 0, 0)
    const newEnd = new Date(newStart.getTime() + dragRef.current.duration * 60000)

    onCitaDrop(dragRef.current.citaId, newStart, newEnd)
    dragRef.current = null
  }

  function formatTime(date: Date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  // Now indicator position
  const now = new Date()
  const isToday =
    now.getFullYear() === fecha.getFullYear() &&
    now.getMonth() === fecha.getMonth() &&
    now.getDate() === fecha.getDate()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = ((nowMinutes - HORA_INICIO * 60) / 60) * HORA_HEIGHT
  const showNow = isToday && nowMinutes >= HORA_INICIO * 60 && nowMinutes <= HORA_FIN * 60

  const totalHeight = (HORA_FIN - HORA_INICIO) * HORA_HEIGHT

  // Availability helpers
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
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Header with professional columns */}
      <div className="flex border-b bg-muted/30 shrink-0">
        <div className="w-14 shrink-0 border-r" />
        {profesionales.map((prof) => {
          const count = citasPorProfesional.get(prof.id)?.length || 0
          const avail = getAvailability(prof.id)
          return (
            <div
              key={prof.id}
              className="flex-1 min-w-[140px] px-2 py-1.5 text-center border-r last:border-r-0"
            >
              {/* Availability line */}
              <div className="flex items-center justify-center gap-1 mb-0.5">
                {avail ? (
                  <>
                    <span className="text-[10px] text-muted-foreground">{fromMin(avail.workStart)}-{fromMin(avail.workEnd)}</span>
                    {avail.freeSlots.length === 0 ? (
                      <span className="text-[10px] text-red-500">Sin disp.</span>
                    ) : (
                      avail.freeSlots.map((s, i) => (
                        <span key={i} className="text-[10px] text-green-600 dark:text-green-400">
                          {fromMin(s.start)}-{fromMin(s.end)}
                        </span>
                      ))
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground/60 italic">No trabaja</span>
                )}
              </div>
              {/* Name + count */}
              <div className="flex items-center justify-center gap-1.5">
                <span
                  className="inline-block h-6 w-6 rounded-full shrink-0"
                  style={{ backgroundColor: prof.color }}
                />
                <span className="text-sm font-medium truncate">{prof.nombre}</span>
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

      {/* Scrollable grid body */}
      <div ref={gridRef} className="overflow-y-auto overflow-x-auto flex-1">
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Time column */}
          <div className="w-14 shrink-0 border-r relative bg-card">
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
              className="flex-1 min-w-[140px] border-r last:border-r-0 relative"
              onClick={(e) => handleGridClick(prof.id, e)}
              onDragOver={(e) => handleDragOver(prof.id, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(prof.id, e)}
            >
              {/* Hour lines */}
              {timeSlots.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border"
                  style={{ top: (hour - HORA_INICIO) * HORA_HEIGHT }}
                />
              ))}
              {/* Half hour lines */}
              {timeSlots.map((hour) => (
                <div
                  key={`${hour}-half`}
                  className="absolute left-0 right-0 border-t border-border/30"
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
                    className="absolute left-1 right-1 rounded-md border border-dashed border-gray-400 dark:border-gray-600 bg-gray-200/60 dark:bg-gray-800/60 px-1.5 py-0.5 overflow-hidden cursor-pointer transition-colors z-[1]"
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onBloqueoClick?.(bloqueo)
                    }}
                  >
                    {isSmall ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-snug">
                        Bloqueado
                      </p>
                    ) : (
                      <>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                          {formatTime(start)} - {formatTime(end)}
                        </p>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
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
                return (
                  <div
                    key={cita.id}
                    data-cita
                    draggable
                    onDragStart={(e) => handleDragStart(cita, e)}
                    className="absolute left-1 right-1 rounded-md border-l-[3px] bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 px-1.5 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing transition-all z-[1] hover:z-[5] hover:shadow-lg hover:ring-2 hover:ring-fuchsia-500/40 shadow-sm"
                    style={{
                      top: `${pos.top}px`,
                      height: `${pos.height}px`,
                      borderLeftColor: prof.color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCitaClick(cita)
                    }}
                  >
                    {isSmall ? (
                      <p className="text-[11px] font-medium truncate leading-snug">
                        {formatTime(start)} {cita.clientes?.nombre || 'Sin cliente'} - {cita.servicios?.nombre || ''}
                      </p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {formatTime(start)} - {formatTime(end)}
                        </p>
                        <p className="text-xs font-medium truncate leading-tight mt-0.5">
                          {cita.clientes?.nombre || 'Sin cliente'}
                        </p>
                        <p className="text-[11px] font-semibold truncate leading-tight">
                          {cita.servicios?.nombre || 'Sin servicio'}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Drop preview */}
          {dropPreview && profesionales.map((prof, idx) => (
            dropPreview.profId === prof.id && (
              <div
                key={`preview-${prof.id}`}
                className="absolute rounded-md border-2 border-dashed border-fuchsia-500 bg-fuchsia-500/10 z-[3] pointer-events-none"
                style={{
                  top: `${dropPreview.top}px`,
                  height: `${dropPreview.height}px`,
                  left: `calc(3.5rem + ${idx} * (100% - 3.5rem) / ${profesionales.length})`,
                  width: `calc((100% - 3.5rem) / ${profesionales.length} - 2px)`,
                }}
              />
            )
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
    </div>
  )
}
