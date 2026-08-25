'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Activity, RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface LogEntry {
  id: string
  tabla: string
  accion: string
  registro_id: string | null
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  usuario_email: string | null
  created_at: string
  cliente: { nombre: string; apellido: string | null } | null
  profesional?: { nombre: string | null } | null
}

function formatUsuario(email: string | null): string {
  if (!email) return 'Sistema'
  if (email === 'ravamartin@gmail.com') return 'Admin'
  if (email.endsWith('@estetica.local')) return email.split('@')[0]
  return email
}

// Campos que NO se muestran como cambios en el detalle (son metadatos internos).
const CAMPOS_INTERNOS = new Set(['updated_at', 'created_at', 'recordatorio_whatsapp_enviado'])

function getCamposCambiados(log: LogEntry): string[] {
  if (log.accion !== 'update') return []
  const prev = log.datos_anteriores || {}
  const next = log.datos_nuevos || {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const cambios: string[] = []
  for (const k of keys) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) cambios.push(k)
  }
  return cambios
}

function tieneCambiosRelevantes(log: LogEntry): boolean {
  if (log.accion !== 'update') return true
  return getCamposCambiados(log).some(k => !CAMPOS_INTERNOS.has(k))
}

function formatAccion(log: LogEntry): { label: string; color: string } {
  const prev = log.datos_anteriores
  const next = log.datos_nuevos

  // Bloqueos
  if (log.tabla === 'bloqueos') {
    if (log.accion === 'insert') return { label: 'Bloqueó horario', color: 'bg-orange-100 text-orange-700' }
    if (log.accion === 'delete') return { label: 'Quitó bloqueo', color: 'bg-lime-100 text-lime-700' }
    return { label: 'Modificó bloqueo', color: 'bg-orange-100 text-orange-700' }
  }

  // Desbloqueos (habilitaciones excepcionales)
  if (log.tabla === 'desbloqueos') {
    if (log.accion === 'insert') return { label: 'Habilitó horario', color: 'bg-emerald-100 text-emerald-700' }
    if (log.accion === 'delete') return { label: 'Quitó habilitación', color: 'bg-slate-100 text-slate-700' }
    return { label: 'Modificó habilitación', color: 'bg-emerald-100 text-emerald-700' }
  }

  // Horarios laborales
  if (log.tabla === 'horarios') {
    if (log.accion === 'insert') return { label: 'Agregó horario', color: 'bg-teal-100 text-teal-700' }
    if (log.accion === 'delete') return { label: 'Eliminó horario', color: 'bg-red-100 text-red-700' }
    return { label: 'Modificó horario', color: 'bg-teal-100 text-teal-700' }
  }

  // Citas (comportamiento original)
  if (log.accion === 'insert') {
    const origen = next?.origen as string | undefined
    if (origen === 'online') return { label: 'Reserva online', color: 'bg-blue-100 text-blue-700' }
    if (origen === 'sheets') return { label: 'Importado sheets', color: 'bg-slate-100 text-slate-700' }
    return { label: 'Nueva cita', color: 'bg-green-100 text-green-700' }
  }

  if (log.accion === 'delete') {
    return { label: 'Eliminó cita', color: 'bg-red-100 text-red-700' }
  }

  if (log.accion === 'update') {
    const cambios = getCamposCambiados(log)
    const cambiosReales = cambios.filter(k => !CAMPOS_INTERNOS.has(k))

    // Solo se cambió el flag de recordatorio → mostrar como acción especial
    if (cambiosReales.length === 0 && cambios.includes('recordatorio_whatsapp_enviado')) {
      return { label: 'Recordatorio WA enviado', color: 'bg-slate-100 text-slate-600' }
    }
    if (cambiosReales.length === 0) {
      return { label: 'Cambio interno', color: 'bg-slate-100 text-slate-500' }
    }

    if (cambiosReales.includes('status')) {
      const statusLabels: Record<string, string> = {
        pendiente: 'Pendiente', confirmada: 'Confirmada',
        completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
      }
      const from = statusLabels[prev?.status as string] ?? prev?.status
      const to = statusLabels[next?.status as string] ?? next?.status
      if (next?.status === 'cancelada') return { label: `Canceló turno`, color: 'bg-red-100 text-red-700' }
      if (next?.status === 'completada') return { label: `Completó turno`, color: 'bg-green-100 text-green-700' }
      return { label: `${from} → ${to}`, color: 'bg-yellow-100 text-yellow-700' }
    }
    if (cambiosReales.includes('fecha_inicio') || cambiosReales.includes('fecha_fin')) {
      return { label: 'Reprogramó', color: 'bg-purple-100 text-purple-700' }
    }
    if (cambiosReales.includes('profesional_id')) {
      return { label: 'Cambió profesional', color: 'bg-indigo-100 text-indigo-700' }
    }
    if (cambiosReales.includes('servicio_id')) {
      return { label: 'Cambió servicio', color: 'bg-cyan-100 text-cyan-700' }
    }
    if (cambiosReales.includes('precio_cobrado')) {
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

const STATUS_ES: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

const METODO_PAGO_ES: Record<string, string> = {
  efectivo: 'Efectivo',
  mercadopago: 'MercadoPago',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
}

const ORIGEN_ES: Record<string, string> = {
  online: 'Reserva online',
  manual: 'Cargada manualmente',
  sheets: 'Importada desde Sheets',
}

const CAMPOS_MOSTRAR: Array<{ key: string; label: string; format?: (v: unknown) => string }> = [
  { key: 'fecha_inicio', label: 'Inicio', format: v => v ? format(new Date(v as string), 'dd/MM/yyyy HH:mm', { locale: es }) : '-' },
  { key: 'fecha_fin', label: 'Fin', format: v => v ? format(new Date(v as string), 'HH:mm', { locale: es }) : '-' },
  { key: 'status', label: 'Estado', format: v => STATUS_ES[v as string] ?? String(v ?? '-') },
  { key: 'profesional_id', label: 'Profesional', format: v => v ? `${String(v).slice(0, 8)}...` : '-' },
  { key: 'servicio_id', label: 'Servicio', format: v => v ? `${String(v).slice(0, 8)}...` : '-' },
  { key: 'precio_cobrado', label: 'Precio', format: v => v != null ? `$${Number(v).toLocaleString('es-AR')}` : '-' },
  { key: 'metodo_pago', label: 'Método pago', format: v => METODO_PAGO_ES[v as string] ?? String(v ?? '-') },
  { key: 'origen', label: 'Origen', format: v => ORIGEN_ES[v as string] ?? String(v ?? '-') },
  { key: 'notas', label: 'Notas', format: v => v ? String(v) : '(vacío)' },
]

interface DiffField {
  label: string
  antes: string
  despues: string
  changed: boolean
}

function getDiff(log: LogEntry): DiffField[] {
  const prev = log.datos_anteriores || {}
  const next = log.datos_nuevos || {}
  const isInsert = log.accion === 'insert'
  const isDelete = log.accion === 'delete'
  const base = isInsert ? next : isDelete ? prev : next
  const diffs: DiffField[] = []

  for (const campo of CAMPOS_MOSTRAR) {
    const antesVal = prev[campo.key]
    const despuesVal = next[campo.key]
    const antesStr = campo.format ? campo.format(antesVal) : String(antesVal ?? '-')
    const despuesStr = campo.format ? campo.format(despuesVal) : String(despuesVal ?? '-')
    const changed = !isInsert && !isDelete && JSON.stringify(antesVal) !== JSON.stringify(despuesVal)

    if (isInsert) {
      if (base[campo.key] != null) {
        diffs.push({ label: campo.label, antes: '', despues: despuesStr, changed: false })
      }
    } else if (isDelete) {
      if (base[campo.key] != null) {
        diffs.push({ label: campo.label, antes: antesStr, despues: '', changed: false })
      }
    } else {
      // update: mostrar solo campos que cambiaron
      if (changed) {
        diffs.push({ label: campo.label, antes: antesStr, despues: despuesStr, changed: true })
      }
    }
  }
  return diffs
}

interface DetallePanelProps {
  log: LogEntry
  profMap: Record<string, string>
  servMap: Record<string, { nombre: string; duracion: number }>
}

function formatFecha(v: unknown): string {
  if (!v) return '—'
  try {
    return format(new Date(v as string), "d MMM yyyy, HH:mm", { locale: es })
  } catch {
    return String(v)
  }
}

function formatHora(v: unknown): string {
  if (!v) return '—'
  try {
    return format(new Date(v as string), "HH:mm", { locale: es })
  } catch {
    return String(v)
  }
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function DetallePanel({ log, profMap, servMap }: DetallePanelProps) {
  const prev = log.datos_anteriores || {}
  const next = log.datos_nuevos || {}

  const resolve = {
    fecha_inicio: (v: unknown) => formatFecha(v),
    fecha_fin: (v: unknown) => log.tabla === 'bloqueos' ? formatFecha(v) : formatHora(v),
    fecha: (v: unknown) => v ? format(new Date(v as string), 'd MMM yyyy', { locale: es }) : '—',
    profesional_id: (v: unknown) => v ? (profMap[v as string] || `Prof. ${String(v).slice(0, 6)}`) : '—',
    servicio_id: (v: unknown) => v ? (servMap[v as string]?.nombre || `Serv. ${String(v).slice(0, 6)}`) : '—',
    status: (v: unknown) => STATUS_ES[v as string] ?? String(v ?? '—'),
    metodo_pago: (v: unknown) => METODO_PAGO_ES[v as string] ?? String(v ?? '—'),
    origen: (v: unknown) => ORIGEN_ES[v as string] ?? String(v ?? '—'),
    precio_cobrado: (v: unknown) => v != null ? `$${Number(v).toLocaleString('es-AR')}` : '—',
    notas: (v: unknown) => v ? String(v) : '—',
    motivo: (v: unknown) => v ? String(v) : '(sin motivo)',
    hora_inicio: (v: unknown) => v ? String(v).slice(0, 5) : '—',
    hora_fin: (v: unknown) => v ? String(v).slice(0, 5) : '—',
    dia_semana: (v: unknown) => v != null ? DIAS_SEMANA[Number(v)] || String(v) : '—',
    activo: (v: unknown) => v === true ? 'Activo' : v === false ? 'Inactivo' : '—',
  }

  // Diferentes tablas usan diferentes campos
  const CAMPOS_POR_TABLA: Record<string, Array<{ key: keyof typeof resolve; label: string }>> = {
    citas: [
      { key: 'fecha_inicio', label: 'Fecha y hora' },
      { key: 'fecha_fin', label: 'Fin' },
      { key: 'profesional_id', label: 'Profesional' },
      { key: 'servicio_id', label: 'Servicio' },
      { key: 'status', label: 'Estado' },
      { key: 'precio_cobrado', label: 'Precio' },
      { key: 'metodo_pago', label: 'Método pago' },
      { key: 'origen', label: 'Origen' },
      { key: 'notas', label: 'Notas' },
    ],
    bloqueos: [
      { key: 'profesional_id', label: 'Profesional' },
      { key: 'fecha_inicio', label: 'Desde' },
      { key: 'fecha_fin', label: 'Hasta' },
      { key: 'motivo', label: 'Motivo' },
    ],
    desbloqueos: [
      { key: 'profesional_id', label: 'Profesional' },
      { key: 'fecha', label: 'Fecha' },
      { key: 'hora_inicio', label: 'Desde' },
      { key: 'hora_fin', label: 'Hasta' },
      { key: 'motivo', label: 'Motivo' },
    ],
    horarios: [
      { key: 'profesional_id', label: 'Profesional' },
      { key: 'dia_semana', label: 'Día' },
      { key: 'hora_inicio', label: 'Desde' },
      { key: 'hora_fin', label: 'Hasta' },
      { key: 'activo', label: 'Estado' },
    ],
  }

  const CAMPOS_DETALLE = CAMPOS_POR_TABLA[log.tabla] || CAMPOS_POR_TABLA.citas
  const registroTipo = log.tabla === 'citas' ? 'cita' : log.tabla.slice(0, -1)

  const camposCambiados = getCamposCambiados(log).filter(k => !CAMPOS_INTERNOS.has(k))
  const soloInternos = log.accion === 'update' && camposCambiados.length === 0

  if (soloInternos) {
    // Solo cambió recordatorio_whatsapp_enviado u otro flag interno
    return (
      <div className="pt-3 space-y-3">
        <p className="text-xs text-muted-foreground italic">
          Solo se actualizó un dato interno. Los datos visibles no cambiaron.
        </p>
        <div className="rounded-lg border bg-background/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Datos actuales</div>
          {CAMPOS_DETALLE.map(c => {
            const val = next[c.key] ?? prev[c.key]
            const resolvedVal = resolve[c.key](val)
            if (resolvedVal === '—') return null
            return (
              <div key={c.key} className="grid grid-cols-[110px_1fr] gap-3 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-foreground font-medium">{resolvedVal}</span>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          ID {registroTipo}: <code className="tabular-nums">{log.registro_id?.slice(0, 8)}...</code>
        </div>
      </div>
    )
  }

  if (log.accion === 'insert') {
    // Mostrar todos los datos del insert
    return (
      <div className="pt-3 space-y-2">
        <div className="rounded-lg border bg-green-50/30 dark:bg-green-950/20 border-green-200/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-400 font-semibold mb-1">Datos del nuevo {registroTipo}</div>
          {CAMPOS_DETALLE.map(c => {
            const val = next[c.key]
            const resolvedVal = resolve[c.key](val)
            if (resolvedVal === '—') return null
            return (
              <div key={c.key} className="grid grid-cols-[110px_1fr] gap-3 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-foreground font-medium">{resolvedVal}</span>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          ID {registroTipo}: <code className="tabular-nums">{log.registro_id?.slice(0, 8)}...</code>
        </div>
      </div>
    )
  }

  if (log.accion === 'delete') {
    return (
      <div className="pt-3 space-y-2">
        <div className="rounded-lg border bg-red-50/30 dark:bg-red-950/20 border-red-200/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-400 font-semibold mb-1">Datos {log.tabla === 'citas' ? 'de la cita' : 'del ' + registroTipo} eliminad{log.tabla === 'citas' ? 'a' : 'o'}</div>
          {CAMPOS_DETALLE.map(c => {
            const val = prev[c.key]
            const resolvedVal = resolve[c.key](val)
            if (resolvedVal === '—') return null
            return (
              <div key={c.key} className="grid grid-cols-[110px_1fr] gap-3 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-foreground font-medium">{resolvedVal}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // UPDATE con cambios reales — mostrar ANTES / DESPUÉS lado a lado
  return (
    <div className="pt-3 space-y-2">
      <div className="grid md:grid-cols-2 gap-3">
        {/* Columna ANTES */}
        <div className="rounded-lg border bg-red-50/30 dark:bg-red-950/20 border-red-200/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-400 font-semibold mb-1">Antes</div>
          {CAMPOS_DETALLE.map(c => {
            const val = prev[c.key]
            const resolvedVal = resolve[c.key](val)
            const changed = camposCambiados.includes(c.key)
            if (resolvedVal === '—' && !changed) return null
            return (
              <div key={c.key} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className={changed ? 'text-red-700 dark:text-red-400 font-medium line-through decoration-red-400/50' : 'text-foreground'}>
                  {resolvedVal}
                </span>
              </div>
            )
          })}
        </div>

        {/* Columna DESPUÉS */}
        <div className="rounded-lg border bg-green-50/30 dark:bg-green-950/20 border-green-200/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-400 font-semibold mb-1">Después</div>
          {CAMPOS_DETALLE.map(c => {
            const val = next[c.key]
            const resolvedVal = resolve[c.key](val)
            const changed = camposCambiados.includes(c.key)
            if (resolvedVal === '—' && !changed) return null
            return (
              <div key={c.key} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className={changed ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-foreground'}>
                  {resolvedVal}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/70">
        ID cita: <code className="tabular-nums">{log.registro_id?.slice(0, 8)}...</code>
        {' · '}Campos modificados: <strong>{camposCambiados.length}</strong>
      </div>
    </div>
  )
}

export default function ActividadPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [busqueda, setBusqueda] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [profMap, setProfMap] = useState<Record<string, string>>({})
  const [servMap, setServMap] = useState<Record<string, { nombre: string; duracion: number }>>({})

  async function fetchLogs() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '500', desde, hasta })
      const res = await fetch(`/api/actividad?${params}`)
      const data = await res.json()
      setLogs(data.logs ?? [])
    } finally {
      setLoading(false)
    }
  }

  // Cargar profesionales y servicios una sola vez para resolver IDs → nombres
  useEffect(() => {
    async function fetchLookups() {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/actividad/lookup?tipo=profesionales').then(r => r.ok ? r.json() : null),
        fetch('/api/actividad/lookup?tipo=servicios').then(r => r.ok ? r.json() : null),
      ])
      if (pRes?.items) {
        const m: Record<string, string> = {}
        for (const p of pRes.items) m[p.id] = p.nombre
        setProfMap(m)
      }
      if (sRes?.items) {
        const m: Record<string, { nombre: string; duracion: number }> = {}
        for (const s of sRes.items) m[s.id] = { nombre: s.nombre, duracion: s.duracion_minutos }
        setServMap(m)
      }
    }
    fetchLookups()
  }, [])

  useEffect(() => { fetchLogs() }, [desde, hasta])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resolveValue(campo: string, value: unknown): string {
    if (value == null) return '-'
    if (campo === 'profesional_id') return profMap[value as string] || `${String(value).slice(0, 8)}...`
    if (campo === 'servicio_id') return servMap[value as string]?.nombre || `${String(value).slice(0, 8)}...`
    return String(value)
  }

  const logsFiltrados = busqueda.trim()
    ? logs.filter(l => {
        const nombre = l.cliente ? `${l.cliente.nombre} ${l.cliente.apellido ?? ''}`.toLowerCase() : ''
        return nombre.includes(busqueda.toLowerCase().trim())
      })
    : logs

  const resumen = {
    online: logs.filter(l => l.accion === 'insert' && l.datos_nuevos?.origen === 'online').length,
    manual: logs.filter(l => l.accion === 'insert' && l.datos_nuevos?.origen !== 'online').length,
    canceladas: logs.filter(l => l.accion === 'update' && l.datos_nuevos?.status === 'cancelada').length,
    reprogramadas: logs.filter(l => l.accion === 'update' && l.datos_anteriores?.fecha_inicio !== l.datos_nuevos?.fecha_inicio && l.datos_nuevos?.status !== 'cancelada').length,
  }

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

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="text-sm border rounded-md pl-8 pr-3 py-1.5 bg-background w-48"
          />
        </div>
        {logs.length > 0 && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className="text-[11px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
              {resumen.online} online
            </span>
            <span className="text-[11px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
              {resumen.manual} manual{resumen.manual !== 1 ? 'es' : ''}
            </span>
            {resumen.canceladas > 0 && (
              <span className="text-[11px] bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                {resumen.canceladas} cancelada{resumen.canceladas !== 1 ? 's' : ''}
              </span>
            )}
            {resumen.reprogramadas > 0 && (
              <span className="text-[11px] bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
                {resumen.reprogramadas} reprogramada{resumen.reprogramadas !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-muted-foreground pl-1">{logsFiltrados.length} registros</span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Registro de actividad
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
              {logsFiltrados.map(log => {
                const { label, color } = formatAccion(log)
                const detalle = formatDetalle(log)
                const clienteNombre = log.cliente
                  ? `${log.cliente.nombre}${log.cliente.apellido ? ' ' + log.cliente.apellido : ''}`
                  : log.profesional?.nombre
                  ? `Prof. ${log.profesional.nombre}`
                  : null
                const isExpanded = expanded.has(log.id)
                const diff = getDiff(log)
                const hasDetail = diff.length > 0 || log.datos_nuevos || log.datos_anteriores

                return (
                  <div key={log.id}>
                    <button
                      onClick={() => hasDetail && toggleExpand(log.id)}
                      className={`w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors text-left ${hasDetail ? 'cursor-pointer' : ''}`}
                    >
                      <div className="w-4 shrink-0 text-muted-foreground">
                        {hasDetail && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                      </div>
                      <div className="w-32 shrink-0">
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
                    </button>

                    {/* Panel expandido con detalles antes/después */}
                    {isExpanded && (
                      <div className="px-6 pb-4 pl-14 bg-muted/20 border-t">
                        <DetallePanel log={log} profMap={profMap} servMap={servMap} />
                      </div>
                    )}
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
