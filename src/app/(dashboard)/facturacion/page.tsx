'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/dates'
import {
  Receipt,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  Settings2,
  ExternalLink,
  Info,
  RotateCcw,
  ChevronDown,
  CreditCard,
  Send,
  Search,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type EstadoFactura = 'pendiente' | 'excluida' | 'emitida' | 'error'
type RowMode = 'idle' | 'confirming' | 'loading'

interface ItemFacturacion {
  afip_row_key: string
  fecha: string
  cliente_nombre: string
  cliente_dni: string | null
  servicio_nombre: string
  monto: number
  factura_id: string | null
  factura_estado: EstadoFactura | null
  factura_cae: string | null
  factura_numero: string | null
  factura_vencimiento: string | null
  factura_error: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mesLabel(d: Date) {
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function initials(nombre: string) {
  const parts = nombre.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

function formatDNI(dni: string) {
  const n = dni.replace(/\D/g, '')
  if (n.length === 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`
  if (n.length === 7) return `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`
  return dni
}

const AVATAR_COLORS = [
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
]
function avatarColor(nombre: string) {
  return AVATAR_COLORS[nombre.charCodeAt(0) % AVATAR_COLORS.length]
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function FacturacionPage() {
  const supabase = createClient()

  const [tab, setTab] = useState<'lista' | 'configuracion'>('lista')
  const [items, setItems] = useState<ItemFacturacion[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rowMode, setRowMode] = useState<Record<string, RowMode>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; checks: Record<string, { ok: boolean; detail: string }>; entorno?: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'emitida'>('todos')

  async function testConexion() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/facturacion/test')
      const json = await res.json()
      setTestResult(json)
    } catch {
      setTestResult({ ok: false, checks: { conexion: { ok: false, detail: 'Error de red al contactar el servidor' } } })
    } finally {
      setTestLoading(false)
    }
  }

  const [mesBase, setMesBase] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const mesAnterior  = () => setMesBase(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const mesSiguiente = () => setMesBase(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const y = mesBase.getFullYear()
    const m = mesBase.getMonth() + 1
    const mes = `${y}-${String(m).padStart(2, '0')}`
    const res = await fetch(`/api/facturacion/sheet?mes=${mes}`)
    if (!res.ok) {
      setFetchError('Error al cargar la hoja Afip del Google Sheet.')
      setLoading(false)
      return
    }
    const json = await res.json()
    setItems(json.items || [])
    setLoading(false)
  }, [mesBase])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Helpers de fila ───────────────────────────────────────────────────────

  function setMode(k: string, m: RowMode) { setRowMode(p => ({ ...p, [k]: m })) }
  function setErr(k: string, m: string)   { setRowError(p => ({ ...p, [k]: m })) }
  function clearErr(k: string)             { setRowError(p => { const n = { ...p }; delete n[k]; return n }) }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /** ✓ click → pide confirmación */
  function handleCheckClick(k: string) { clearErr(k); setMode(k, 'confirming') }

  /** Enviar a ARCA (futuro) */
  async function handleEnviarARCA(item: ItemFacturacion) {
    setMode(item.afip_row_key, 'loading')
    clearErr(item.afip_row_key)
    try {
      const res = await fetch('/api/facturacion/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          afip_row_key:    item.afip_row_key,
          receptor_nombre: item.cliente_nombre,
          receptor_dni:    item.cliente_dni,
          monto:           item.monto,
          fecha:           item.fecha,
          descripcion:     item.servicio_nombre || 'Servicio de estética',
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(item.afip_row_key, json.error || `Error HTTP ${res.status}`)
        setMode(item.afip_row_key, 'idle')
      } else {
        await fetchData()
        setMode(item.afip_row_key, 'idle')
      }
    } catch {
      setErr(item.afip_row_key, 'No se pudo conectar con el servidor.')
      setMode(item.afip_row_key, 'idle')
    }
  }

  /** Marcar como ya facturada (manualmente, sin ARCA) */
  async function handleMarcarManual(item: ItemFacturacion) {
    setMode(item.afip_row_key, 'loading')
    clearErr(item.afip_row_key)

    let dbErr: string | null = null

    if (item.factura_id) {
      const { error } = await supabase.from('facturas')
        .update({ estado: 'emitida', datos_json: { manual: true } })
        .eq('id', item.factura_id)
      if (error) dbErr = error.message
    } else {
      const { error } = await supabase.from('facturas').insert({
        afip_row_key:    item.afip_row_key,
        fecha:           item.fecha,
        monto:           item.monto,
        descripcion:     item.servicio_nombre,
        receptor_nombre: item.cliente_nombre,
        receptor_dni:    item.cliente_dni,
        estado:          'emitida',
        datos_json:      { manual: true },
      })
      if (error) dbErr = error.message
    }

    if (dbErr) {
      setErr(item.afip_row_key, dbErr)
      setMode(item.afip_row_key, 'idle')
      return
    }

    await fetchData()
    setMode(item.afip_row_key, 'idle')
  }

  /** ✗ → excluir (no facturar) */
  async function handleExcluir(item: ItemFacturacion) {
    setMode(item.afip_row_key, 'loading')
    clearErr(item.afip_row_key)

    let dbErr: string | null = null

    if (item.factura_id) {
      const { error } = await supabase.from('facturas').update({ estado: 'excluida' }).eq('id', item.factura_id)
      if (error) dbErr = error.message
    } else {
      const { error } = await supabase.from('facturas').insert({
        afip_row_key:    item.afip_row_key,
        fecha:           item.fecha,
        monto:           item.monto,
        descripcion:     item.servicio_nombre,
        receptor_nombre: item.cliente_nombre,
        receptor_dni:    item.cliente_dni,
        estado:          'excluida',
      })
      if (error) dbErr = error.message
    }

    if (dbErr) {
      setErr(item.afip_row_key, dbErr)
      setMode(item.afip_row_key, 'idle')
      return
    }

    await fetchData()
    setMode(item.afip_row_key, 'idle')
  }

  /** Restaurar excluida */
  async function handleRestaurar(item: ItemFacturacion) {
    if (!item.factura_id) return
    setMode(item.afip_row_key, 'loading')
    await supabase.from('facturas').delete().eq('id', item.factura_id)
    await fetchData()
    setMode(item.afip_row_key, 'idle')
  }

  // ── Particiones ───────────────────────────────────────────────────────────

  const pendientes = items.filter(i => !i.factura_estado || i.factura_estado === 'pendiente')
  const emitidas   = items.filter(i => i.factura_estado === 'emitida')
  const excluidas  = items.filter(i => i.factura_estado === 'excluida')
  const conError   = items.filter(i => i.factura_estado === 'error')

  // Búsqueda + filtro de estado
  function aplicarFiltros(lista: ItemFacturacion[]) {
    return lista.filter(i =>
      !busqueda || i.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase())
    )
  }
  const pendientesFiltrados = filtroEstado !== 'emitida'  ? aplicarFiltros([...pendientes, ...conError]) : []
  const emitidasFiltradas   = filtroEstado !== 'pendiente' ? aplicarFiltros(emitidas)  : []

  const totalMonto     = items.filter(i => i.factura_estado !== 'excluida').reduce((s, i) => s + i.monto, 0)
  const montoEmitido   = emitidas.reduce((s, i) => s + i.monto, 0)
  const montoPendiente = [...pendientes, ...conError].reduce((s, i) => s + i.monto, 0)

  // ── Render de una fila ────────────────────────────────────────────────────

  function renderFila(item: ItemFacturacion) {
    const k    = item.afip_row_key
    const mode = rowMode[k] || 'idle'
    const err  = rowError[k]
    const esManual = (item as any).datos_json?.manual === true

    // ── Emitida ──────────────────────────────────────────────────────────────
    if (item.factura_estado === 'emitida') {
      return (
        <li key={k} className="grid grid-cols-[2.25rem_1fr_auto] md:grid-cols-[2.25rem_1.5fr_1fr_1.5fr_4.5rem_5.5rem_6rem_auto] items-center gap-x-3 gap-y-0 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          {/* Avatar */}
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
            {initials(item.cliente_nombre)}
          </div>
          {/* Nombre */}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{item.cliente_nombre}</p>
          </div>
          {/* DNI */}
          <div className="hidden md:block">
            {item.cliente_dni
              ? <span className="font-mono text-sm font-medium text-gray-700">{formatDNI(item.cliente_dni)}</span>
              : <span className="text-xs text-muted-foreground italic">Sin DNI</span>}
          </div>
          {/* Servicio */}
          <p className="hidden md:block text-xs text-muted-foreground truncate">{item.servicio_nombre}</p>
          {/* Fecha */}
          <p className="hidden md:block text-xs text-muted-foreground text-right">{isoToDisplay(item.fecha)}</p>
          {/* ESTADO */}
          <div className="hidden md:flex justify-center">
            <span className="rounded-full bg-green-200 text-green-800 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">Facturada</span>
          </div>
          {/* Monto */}
          <p className="font-bold text-sm text-right">{formatPrecio(item.monto)}</p>
          {/* Estado */}
          <div className="flex flex-col items-end gap-0.5 min-w-[100px]">
            {item.factura_cae ? (
              <>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-700 whitespace-nowrap">
                  <CheckCircle2 className="h-3.5 w-3.5" /> N°{item.factura_numero}
                </span>
                <span className="font-mono text-[10px] text-green-600 tracking-tight">{item.factura_cae}</span>
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-green-700 whitespace-nowrap">
                <CheckCircle2 className="h-3.5 w-3.5" /> Facturada
                <span className="rounded bg-green-200 px-1 py-0.5 text-[10px] font-medium text-green-800">Manual</span>
              </span>
            )}
          </div>
        </li>
      )
    }

    // ── Excluida ─────────────────────────────────────────────────────────────
    if (item.factura_estado === 'excluida') {
      return (
        <li key={k} className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-2.5 opacity-50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
            {initials(item.cliente_nombre)}
          </div>
          <p className="flex-1 text-sm line-through truncate">{item.cliente_nombre}</p>
          {item.cliente_dni && <span className="hidden md:block font-mono text-xs line-through text-muted-foreground">{formatDNI(item.cliente_dni)}</span>}
          <p className="text-sm font-medium line-through text-muted-foreground">{formatPrecio(item.monto)}</p>
          <button onClick={() => handleRestaurar(item)} disabled={mode === 'loading'}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 whitespace-nowrap">
            {mode === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restaurar
          </button>
        </li>
      )
    }

    // ── Loading ──────────────────────────────────────────────────────────────
    if (mode === 'loading') {
      return (
        <li key={k} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 opacity-60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
          <p className="flex-1 text-sm font-medium">{item.cliente_nombre}</p>
          <p className="text-xs text-muted-foreground">Procesando…</p>
          <p className="font-semibold text-sm">{formatPrecio(item.monto)}</p>
        </li>
      )
    }

    // ── Confirmando ──────────────────────────────────────────────────────────
    if (mode === 'confirming') {
      return (
        <li key={k} className="flex flex-col gap-3 rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-4">
          {/* Resumen del ítem */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{item.cliente_nombre}</p>
            </div>
            {item.cliente_dni
              ? <span className="font-mono text-sm font-semibold bg-white border rounded px-2 py-0.5">{formatDNI(item.cliente_dni)}</span>
              : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin DNI · Consumidor Final</span>}
            <p className="font-bold text-base ml-auto">{formatPrecio(item.monto)}</p>
          </div>

          {/* Opciones */}
          <p className="text-xs text-blue-700 font-medium">¿Qué querés hacer con esta factura?</p>
          <div className="flex flex-wrap gap-2">
            {/* Opción 1: Enviar a ARCA */}
            <button
              onClick={() => handleEnviarARCA(item)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Send className="h-4 w-4" />
              Enviar a ARCA
            </button>

            {/* Opción 2: Marcar como ya facturada */}
            <button
              onClick={() => handleMarcarManual(item)}
              className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Ya fue facturada
            </button>

            {/* Cancelar */}
            <button
              onClick={() => setMode(k, 'idle')}
              className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>

          {/* Aclaración */}
          <p className="text-xs text-muted-foreground">
            <strong>Enviar a ARCA</strong> requiere credenciales configuradas y genera el CAE automáticamente.
            · <strong>Ya fue facturada</strong> marca el ítem como procesado sin conectarse a ARCA (útil para facturas emitidas manualmente desde la web de AFIP).
          </p>
        </li>
      )
    }

    // ── Error ────────────────────────────────────────────────────────────────
    if (err || item.factura_estado === 'error') {
      const msg = err || item.factura_error || 'Error desconocido'
      return (
        <li key={k} className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{item.cliente_nombre}</p>
              <p className="text-xs text-red-600">{msg}</p>
            </div>
            {item.cliente_dni && <span className="font-mono text-sm text-muted-foreground">{formatDNI(item.cliente_dni)}</span>}
            <p className="font-bold text-sm">{formatPrecio(item.monto)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleCheckClick(k)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              <RotateCcw className="h-3 w-3" /> Reintentar
            </button>
            <button onClick={() => handleExcluir(item)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
              <XCircle className="h-3 w-3" /> Descartar
            </button>
          </div>
        </li>
      )
    }

    // ── Pendiente (idle) ─────────────────────────────────────────────────────
    return (
      <li key={k} className="grid grid-cols-[2.25rem_1fr_auto_auto] md:grid-cols-[2.25rem_1.5fr_1fr_1.5fr_4.5rem_5.5rem_6rem_auto] items-center gap-x-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted/20 transition-colors">

        {/* Avatar */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
          {initials(item.cliente_nombre)}
        </div>

        {/* Nombre */}
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{item.cliente_nombre}</p>
          {/* DNI visible en mobile (debajo del nombre) */}
          <p className="md:hidden text-xs text-muted-foreground mt-0.5">
            {item.cliente_dni ? formatDNI(item.cliente_dni) : <span className="text-amber-600">Sin DNI</span>}
          </p>
        </div>

        {/* DNI — columna separada en desktop */}
        <div className="hidden md:flex items-center">
          {item.cliente_dni ? (
            <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 rounded px-2 py-0.5 tracking-wide">
              {formatDNI(item.cliente_dni)}
            </span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 whitespace-nowrap">
              Sin DNI
            </span>
          )}
        </div>

        {/* Servicio */}
        <p className="hidden md:block text-xs text-muted-foreground truncate">{item.servicio_nombre}</p>

        {/* Fecha */}
        <p className="hidden md:block text-xs text-muted-foreground text-right whitespace-nowrap">{isoToDisplay(item.fecha)}</p>

        {/* ESTADO */}
        <div className="hidden md:flex justify-center">
          <span className="rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">Pendiente</span>
        </div>

        {/* Monto */}
        <p className="font-bold text-sm text-right whitespace-nowrap">{formatPrecio(item.monto)}</p>

        {/* Botones ✓ / ✗ */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleCheckClick(k)}
            title="Aprobar / marcar como facturada"
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleExcluir(item)}
            title="No facturar este ítem"
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-red-300 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </li>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-600" />
            Facturación Electrónica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Datos desde hoja "Afip" · Solo MercadoPago · Aprobación manual por ítem
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted p-1 self-start">
          <button onClick={() => setTab('lista')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'lista' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Receipt className="h-3.5 w-3.5" /> Lista
          </button>
          <button onClick={() => setTab('configuracion')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'configuracion' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Settings2 className="h-3.5 w-3.5" /> Config ARCA
          </button>
        </div>
      </div>

      {/* ── TAB: Lista ───────────────────────────────────────────────────────── */}
      {tab === 'lista' && (
        <>
          {/* Selector de mes + búsqueda + filtro */}
          <div className="flex flex-col sm:flex-row flex-wrap items-start gap-3">
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 self-start w-fit">
              <button onClick={mesAnterior} className="rounded p-1 hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="w-44 text-center font-medium capitalize text-sm">{mesLabel(mesBase)}</span>
              <button onClick={mesSiguiente} className="rounded p-1 hover:bg-muted transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="pl-9 pr-3 py-2 w-48 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Filtro de estado */}
            <div className="flex gap-1 rounded-lg border bg-muted p-1 self-start">
              {([['todos', 'Todos'], ['pendiente', 'Pendientes'], ['emitida', 'Facturadas']] as const).map(([val, label]) => (
                <button key={val}
                  onClick={() => setFiltroEstado(val)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filtroEstado === val ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Total MP del mes</p>
                <p className="text-xl font-bold text-blue-700">{formatPrecio(totalMonto)}</p>
                <p className="text-xs text-muted-foreground">{items.length - excluidas.length} ítems</p>
              </div>
              <div className="rounded-xl border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Pendientes</p>
                <p className="text-xl font-bold text-amber-700">{pendientes.length + conError.length}</p>
                <p className="text-xs text-muted-foreground">{formatPrecio(montoPendiente)}</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-xs text-green-700">Facturadas</p>
                <p className="text-xl font-bold text-green-700">{emitidas.length}</p>
                <p className="text-xs text-green-600">{formatPrecio(montoEmitido)}</p>
              </div>
            </div>
          )}

          {/* Error de carga */}
          {fetchError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {fetchError}
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando hoja Afip…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin registros en la hoja "Afip"</p>
              <p className="text-sm mt-1">No hay filas para este mes en el Google Sheet.</p>
            </div>
          ) : (pendientesFiltrados.length === 0 && emitidasFiltradas.length === 0 && excluidas.length === 0) ? (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm mt-1">Probá con otro nombre o filtro.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Encabezado de columnas (desktop) — pendientes */}
              {pendientesFiltrados.length > 0 && (
                <div className="hidden md:grid grid-cols-[2.25rem_1.5fr_1fr_1.5fr_4.5rem_5.5rem_6rem_auto] items-center gap-x-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span />
                  <span>Cliente</span>
                  <span>DNI</span>
                  <span>Servicio</span>
                  <span className="text-right">Fecha</span>
                  <span className="text-center">Estado</span>
                  <span className="text-right">Monto</span>
                  <span className="text-right">Acción</span>
                </div>
              )}

              {/* Pendientes + errores */}
              {pendientesFiltrados.length > 0 && (
                <ul className="space-y-2">
                  {pendientesFiltrados.map(item => renderFila(item))}
                </ul>
              )}

              {/* Emitidas */}
              {emitidasFiltradas.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="hidden md:grid grid-cols-[2.25rem_1.5fr_1fr_1.5fr_4.5rem_5.5rem_6rem_auto] items-center gap-x-3 px-4 text-xs font-semibold text-green-700 uppercase tracking-wide">
                    <span />
                    <span>Cliente</span>
                    <span>DNI</span>
                    <span>Servicio</span>
                    <span className="text-right">Fecha</span>
                    <span className="text-center">Estado</span>
                    <span className="text-right">Monto</span>
                    <span className="text-right">Comprobante</span>
                  </div>
                  <ul className="space-y-2">{emitidasFiltradas.map(item => renderFila(item))}</ul>
                </div>
              )}

              {/* Excluidas (colapsable) */}
              {excluidas.length > 0 && (
                <div className="space-y-2 pt-1">
                  <button onClick={() => setMostrarExcluidas(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mostrarExcluidas ? 'rotate-180' : ''}`} />
                    {mostrarExcluidas ? 'Ocultar' : 'Ver'} descartadas ({excluidas.length})
                  </button>
                  {mostrarExcluidas && (
                    <ul className="space-y-2">{excluidas.map(item => renderFila(item))}</ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Configuración ───────────────────────────────────────────────── */}
      {tab === 'configuracion' && (
        <div className="space-y-5 max-w-2xl">

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-blue-800">
              <Building2 className="h-5 w-5" /> Integración con ARCA (ex-AFIP)
            </div>
            <p className="text-sm text-blue-700 leading-relaxed">
              ARCA usa Web Services SOAP. Flujo: certificado digital →
              autenticación WSAA (token 12 h) → solicitud WSFEV1 →
              recibo <strong>CAE</strong> (14 dígitos de validez fiscal).
            </p>
            <p className="text-sm text-blue-700">
              💡 Sin DNI del cliente → se emite a <strong>Consumidor Final</strong> (válido hasta $10.000.000).
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" /> Pasos para activar
            </h2>
            <ol className="space-y-4 text-sm">
              {[
                { n: 1, title: 'Ejecutar la migración en Supabase',
                  body: <>SQL Editor → pegá el contenido de <code className="bg-muted px-1 rounded text-xs">supabase/migrations/00009_facturas.sql</code></> },
                { n: 2, title: 'Obtener certificado digital X.509 en ARCA',
                  body: 'arca.gob.ar con tu CUIT → Administrador de Relaciones → WSFEV1 → Descargar certificado' },
                { n: 3, title: 'Variables de entorno en Vercel',
                  body: (
                    <div className="mt-1 rounded-lg bg-muted p-3 font-mono text-xs space-y-0.5">
                      <p><span className="text-blue-700">AFIP_CUIT</span>=20xxxxxxxxx8</p>
                      <p><span className="text-blue-700">AFIP_CERT</span>=-----BEGIN CERTIFICATE-----...</p>
                      <p><span className="text-blue-700">AFIP_KEY</span>=-----BEGIN PRIVATE KEY-----...</p>
                      <p><span className="text-blue-700">AFIP_PUNTO_VENTA</span>=1</p>
                      <p><span className="text-blue-700">AFIP_TIPO_CBTE</span>=11 <span className="text-muted-foreground"># 11=Factura C</span></p>
                      <p><span className="text-blue-700">AFIP_PROD</span>=false <span className="text-muted-foreground"># false=testing</span></p>
                    </div>
                  )},
                { n: 4, title: 'Probar en homologación, luego producción',
                  body: 'Con AFIP_PROD=false los CAE son de prueba. Cuando funcione todo, cambiá a true.' },
              ].map(({ n, title, body }) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">{n}</span>
                  <div><p className="font-medium">{title}</p><div className="text-muted-foreground mt-0.5">{body}</div></div>
                </li>
              ))}
            </ol>
            <a href="https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Documentación oficial ARCA
            </a>
          </div>

          {/* Test de conexión */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" /> Probar conexión con ARCA
            </h2>
            <p className="text-sm text-muted-foreground">
              Verifica que las variables de entorno estén configuradas, el certificado sea válido y el WSAA responda.
            </p>
            <button
              onClick={testConexion}
              disabled={testLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {testLoading ? 'Verificando...' : 'Probar conexión'}
            </button>
            {testResult && (
              <div className={`rounded-lg border p-4 space-y-2 ${testResult.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <p className={`font-semibold text-sm ${testResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {testResult.ok ? '✓ Conexión exitosa' : '✗ Hay problemas de configuración'}
                  {testResult.entorno && ` (${testResult.entorno})`}
                </p>
                <ul className="space-y-1">
                  {Object.entries(testResult.checks).map(([key, val]) => (
                    <li key={key} className="flex items-start gap-2 text-xs">
                      <span className={val.ok ? 'text-green-600' : 'text-red-600'}>{val.ok ? '✓' : '✗'}</span>
                      <span className={val.ok ? 'text-green-800' : 'text-red-800'}>{val.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" /> Tipo de factura según categoría fiscal
            </h2>
            <div className="text-sm space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Factura C (tipo 11)</strong> · Monotributista → consumidor final</p>
              <p><strong className="text-foreground">Factura B (tipo 6)</strong> · Resp. Inscripto → consumidor final o monotributista</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              Para clientes <strong>sin DNI</strong>: DocTipo=99 (Consumidor Final), DocNro=0. Válido para montos &lt; $10.000.000.
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
