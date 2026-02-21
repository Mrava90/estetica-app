'use client'

import { useMemo, useEffect, useRef } from 'react'
import type { CitaConRelaciones, Profesional, Bloqueo } from '@/types/database'
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
  onSlotClick: (profesionalId: string, start: Date, end: Date) => void
  onCitaClick: (cita: CitaConRelaciones) => void
  onBloqueoClick?: (bloqueo: Bloqueo) => void
}

export function CalendarioResourceDayView({
  fecha,
  citas,
  profesionales,
  bloqueos = [],
  onSlotClick,
  onCitaClick,
  onBloqueoClick,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const nowRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Header with professional columns */}
      <div className="flex border-b bg-muted/30 shrink-0">
        <div className="w-14 shrink-0 border-r" />
        {profesionales.map((prof) => {
          const count = citasPorProfesional.get(prof.id)?.length || 0
          return (
            <div
              key={prof.id}
              className="flex-1 min-w-[140px] px-2 py-2.5 text-center border-r last:border-r-0"
            >
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
                    className="absolute left-1 right-1 rounded-md border-l-[3px] bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 px-1.5 py-0.5 overflow-hidden cursor-pointer transition-colors z-[1] shadow-sm"
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
