'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Activity, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface LogEntry {
  id: string
  accion: string
  registro_id: string | null
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  usuario_email: string | null
  created_at: string
  cliente: { nombre: string; apellido: string | null } | null
}

function formatUsuario(email: string | null): string {
  if (!email) return 'Sistema'
  if (email === 'ravamartin@gmail.com') return 'Admin'
  if (email.endsWith('@estetica.local')) return email.split('@')[0]
  return email
}

function formatAccion(log: LogEntry): { label: string; color: string } {
  const prev = log.datos_anteriores
  const next = log.datos_nuevos

  if (log.accion === 'insert') {
    const origen = next?.origen as string | undefined
    if (origen === 'online') return { label: 'Reserva online', color: 'bg-blue-100 text-blue-700' }
    return { label: 'Nueva cita', color: 'bg-green-100 text-green-700' }
  }

  if (log.accion === 'delete') {
    return { label: 'Eliminó cita', color: 'bg-red-100 text-red-700' }
  }

  if (log.accion === 'update') {
    if (prev?.status !== next?.status) {
      const statusLabels: Record<string, string> = {
        pendiente: 'Pendiente', confirmada: 'Confirmada',
        completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
      }
      const from = statusLabels[prev?.status as string] ?? prev?.status
      const to = statusLabels[next?.status as string] ?? next?.status
      if (next?.status === 'cancelada') return { label: `Canceló → ${to}`, color: 'bg-red-100 text-red-700' }
      if (next?.status === 'completada') return { label: `Completó turno`, color: 'bg-green-100 text-green-700' }
      return { label: `${from} → ${to}`, color: 'bg-yellow-100 text-yellow-700' }
    }
    if (prev?.fecha_inicio !== next?.fecha_inicio) {
      return { label: 'Reprogramó', color: 'bg-purple-100 text-purple-700' }
    }
    if (prev?.precio_cobrado !== next?.precio_cobrado) {
      return { label: 'Actualizó precio', color: 'bg-orange-100 text-orange-700' }
    }
    return { label: 'Modificó cita', color: 'bg-gray-100 text-gray-700' }
  }

  return { label: log.accion, color: 'bg-gray-100 text-gray-700' }
}

function formatDetalle(log: LogEntry): string {
  const next = log.datos_nuevos
  const prev = log.datos_anteriores

  if (log.accion === 'insert' && next?.fecha_inicio) {
    return format(new Date(next.fecha_inicio as string), "d MMM yyyy HH:mm", { locale: es })
  }
  if (log.accion === 'update' && prev?.fecha_inicio !== next?.fecha_inicio && next?.fecha_inicio) {
    const from = format(new Date(prev?.fecha_inicio as string), "d MMM HH:mm", { locale: es })
    const to = format(new Date(next?.fecha_inicio as string), "d MMM HH:mm", { locale: es })
    return `${from} → ${to}`
  }
  if (log.accion === 'update' && next?.fecha_inicio) {
    return format(new Date(next.fecha_inicio as string), "d MMM yyyy HH:mm", { locale: es })
  }
  return ''
}

export default function ActividadPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchLogs() {
    setLoading(true)
    try {
      const res = await fetch('/api/actividad?limit=200')
      const data = await res.json()
      setLogs(data.logs ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Actividad</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro de cambios en el calendario</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Últimas 200 acciones
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Cargando...</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No hay registros todavía.
            </div>
          ) : (
            <div className="divide-y">
              {logs.map(log => {
                const { label, color } = formatAccion(log)
                const detalle = formatDetalle(log)
                const clienteNombre = log.cliente
                  ? `${log.cliente.nombre}${log.cliente.apellido ? ' ' + log.cliente.apellido : ''}`
                  : null

                return (
                  <div key={log.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors">
                    <div className="w-36 shrink-0">
                      <p className="text-xs font-medium text-foreground tabular-nums">
                        {format(new Date(log.created_at), 'dd/MM HH:mm')}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {format(new Date(log.created_at), "EEEE", { locale: es })}
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <p className="text-xs font-medium truncate">{formatUsuario(log.usuario_email)}</p>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
                        {label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {clienteNombre && (
                        <p className="text-sm font-medium truncate">{clienteNombre}</p>
                      )}
                      {detalle && (
                        <p className="text-xs text-muted-foreground truncate">{detalle}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
