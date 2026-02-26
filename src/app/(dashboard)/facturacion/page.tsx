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

const AVATAR_COLORS = [
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-green-100 text-green-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
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

  // ── Helpers de estado de fila ─────────────────────────────────────────────

  function setMode(key: string, mode: RowMode) {
    setRowMode(p => ({ ...p, [key]: mode }))
  }
  function setErr(key: string, msg: string) {
    setRowError(p => ({ ...p, [key]: msg }))
  }
  function clearErr(key: string) {
    setRowError(p => { const n = { ...p }; delete n[key]; return n })
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  function handleCheckClick(key: string) {
    clearErr(key)
    setMode(key, 'confirming')
  }

  async function handleConfirmar(item: ItemFacturacion) {
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

  async function handleExcluir(item: ItemFacturacion) {
    setMode(item.afip_row_key, 'loading')
    clearErr(item.afip_row_key)

    if (item.factura_id) {
      await supabase.from('facturas').update({ estado: 'excluida' }).eq('id', item.factura_id)
    } else {
      await supabase.from('facturas').insert({
        afip_row_key: item.afip_row_key,
        fecha:        item.fecha,
        monto:        item.monto,
        descripcion:  item.servicio_nombre,
        receptor_nombre: item.cliente_nombre,
        receptor_dni:    item.cliente_dni,
        estado: 'excluida',
      })
    }
    await fetchData()
    setMode(item.afip_row_key, 'idle')
  }

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

  const totalMonto     = items.filter(i => i.factura_estado !== 'excluida').reduce((s, i) => s + i.monto, 0)
  const montoEmitido   = emitidas.reduce((s, i) => s + i.monto, 0)
  const montoPendiente = [...pendientes, ...conError].reduce((s, i) => s + i.monto, 0)

  // ── Render de fila ────────────────────────────────────────────────────────

  function renderFila(item: ItemFacturacion) {
    const key  = item.afip_row_key
    const mode = rowMode[key] || 'idle'
    const err  = rowError[key]

    // ── Emitida ─────────────────────────────────────────────────────────────
    if (item.factura_estado === 'emitida') {
      return (
        <li key={key} className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
            {initials(item.cliente_nombre)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{item.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">{item.cliente_dni ? `DNI ${item.cliente_dni}` : 'Consumidor Final'}</p>
          </div>
          <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[160px]">{item.servicio_nombre}</div>
          <div className="text-right shrink-0">
            <p className="font-semibold text-sm">{formatPrecio(item.monto)}</p>
            <p className="text-xs text-muted-foreground">{isoToDisplay(item.fecha)}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-1 text-green-700 text-xs font-medium whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5" /> N°{item.factura_numero}
            </div>
            <p className="text-xs text-green-600 font-mono">{item.factura_cae?.slice(0, 7)}…</p>
          </div>
        </li>
      )
    }

    // ── Excluida ─────────────────────────────────────────────────────────────
    if (item.factura_estado === 'excluida') {
      return (
        <li key={key} className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-3 opacity-50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-bold">
            {initials(item.cliente_nombre)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-through">{item.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">{item.cliente_dni ? `DNI ${item.cliente_dni}` : '—'}</p>
          </div>
          <p className="font-semibold text-sm line-through shrink-0">{formatPrecio(item.monto)}</p>
          <button
            onClick={() => handleRestaurar(item)}
            disabled={mode === 'loading'}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {mode === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restaurar
          </button>
        </li>
      )
    }

    // ── Loading ──────────────────────────────────────────────────────────────
    if (mode === 'loading') {
      return (
        <li key={key} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 opacity-60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{item.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">Procesando…</p>
          </div>
          <p className="font-semibold text-sm shrink-0">{formatPrecio(item.monto)}</p>
        </li>
      )
    }

    // ── Confirmando ──────────────────────────────────────────────────────────
    if (mode === 'confirming') {
      return (
        <li key={key} className="flex flex-col gap-2.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{item.cliente_nombre}</p>
              <p className="text-xs text-muted-foreground">
                {item.cliente_dni ? `DNI ${item.cliente_dni}` : <span className="text-amber-700">Sin DNI → se emite a Consumidor Final</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">{formatPrecio(item.monto)}</p>
              <p className="text-xs text-muted-foreground">{isoToDisplay(item.fecha)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-white border border-blue-200 px-3 py-2 text-sm text-blue-800">
            <Receipt className="h-4 w-4 shrink-0 text-blue-500" />
            <span>¿Generar factura electrónica en ARCA por <strong>{formatPrecio(item.monto)}</strong>?</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleConfirmar(item)}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Sí, generar
            </button>
            <button
              onClick={() => setMode(key, 'idle')}
              className="flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        </li>
      )
    }

    // ── Error ────────────────────────────────────────────────────────────────
    if (err || item.factura_estado === 'error') {
      const msg = err || item.factura_error || 'Error desconocido'
      return (
        <li key={key} className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{item.cliente_nombre}</p>
              <p className="text-xs text-red-600 truncate">{msg}</p>
            </div>
            <p className="font-semibold text-sm shrink-0">{formatPrecio(item.monto)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleCheckClick(key)}
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

    // ── Pendiente (idle normal) ───────────────────────────────────────────────
    return (
      <li key={key} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted/20 transition-colors group">
        {/* Avatar */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(item.cliente_nombre)}`}>
          {initials(item.cliente_nombre)}
        </div>

        {/* Nombre */}
        <div className="w-40 min-w-0 shrink-0">
          <p className="font-medium text-sm truncate">{item.cliente_nombre}</p>
          <p className="text-xs text-muted-foreground truncate">
            {item.cliente_dni
              ? `DNI ${item.cliente_dni}`
              : <span className="text-amber-600">Sin DNI</span>}
          </p>
        </div>

        {/* Servicio */}
        <p className="flex-1 hidden md:block text-xs text-muted-foreground truncate">
          {item.servicio_nombre}
        </p>

        {/* Fecha */}
        <p className="hidden lg:block text-xs text-muted-foreground shrink-0 w-20 text-right">
          {isoToDisplay(item.fecha)}
        </p>

        {/* Monto */}
        <p className="font-semibold text-sm shrink-0 w-24 text-right">
          {formatPrecio(item.monto)}
        </p>

        {/* Botones ✓ / ✗ */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleCheckClick(key)}
            title="Aprobar y generar factura"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleExcluir(item)}
            title="Descartar (no facturar)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
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
          {/* Selector de mes */}
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 self-start w-fit">
            <button onClick={mesAnterior} className="rounded p-1 hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-44 text-center font-medium capitalize text-sm">{mesLabel(mesBase)}</span>
            <button onClick={mesSiguiente} className="rounded p-1 hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Stats */}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Total MP del mes</p>
                <p className="text-xl font-bold text-blue-700">{formatPrecio(totalMonto)}</p>
                <p className="text-xs text-muted-foreground">{items.length - excluidas.length} transacciones</p>
              </div>
              <div className="rounded-xl border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Pendientes</p>
                <p className="text-xl font-bold text-amber-700">{pendientes.length + conError.length}</p>
                <p className="text-xs text-muted-foreground">{formatPrecio(montoPendiente)}</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-xs text-green-700">Facturas emitidas</p>
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
          ) : (
            <div className="space-y-4">

              {/* Encabezado de columnas */}
              {(pendientes.length > 0 || conError.length > 0) && (
                <div className="flex items-center gap-3 px-4 text-xs font-medium text-muted-foreground">
                  <span className="w-9 shrink-0" />
                  <span className="w-40 shrink-0">Cliente · DNI</span>
                  <span className="flex-1 hidden md:block">Servicio</span>
                  <span className="hidden lg:block w-20 text-right">Fecha</span>
                  <span className="w-24 text-right shrink-0">Monto</span>
                  <span className="w-20 text-right shrink-0">Acción</span>
                </div>
              )}

              {/* Pendientes */}
              {(pendientes.length > 0 || conError.length > 0) && (
                <ul className="space-y-2">
                  {[...pendientes, ...conError].map(item => renderFila(item))}
                </ul>
              )}

              {/* Emitidas */}
              {emitidas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide px-1">
                    Facturas emitidas ({emitidas.length})
                  </p>
                  <ul className="space-y-2">{emitidas.map(item => renderFila(item))}</ul>
                </div>
              )}

              {/* Excluidas (colapsable) */}
              {excluidas.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setMostrarExcluidas(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                  >
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

      {/* ── TAB: Configuración ARCA ───────────────────────────────────────────── */}
      {tab === 'configuracion' && (
        <div className="space-y-5 max-w-2xl">

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-blue-800">
              <Building2 className="h-5 w-5" /> ¿Cómo funciona la integración con ARCA?
            </div>
            <p className="text-sm text-blue-700 leading-relaxed">
              ARCA (ex-AFIP) usa Web Services SOAP. El flujo es: certificado digital →
              autenticación WSAA (token 12 h) → solicitud WSFEV1 →
              recibo <strong>CAE</strong> (14 dígitos que validan la factura fiscalmente).
            </p>
            <p className="text-sm text-blue-700">
              💡 Para servicios de estética a consumidor final, <strong>no se requiere CUIT del cliente</strong> hasta $10.000.000 por operación.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" /> Pasos para activar
            </h2>
            <ol className="space-y-4 text-sm">
              {[
                { n: 1, title: 'Ejecutar la migración en Supabase',
                  body: <>Abrí SQL Editor → ejecutá <code className="bg-muted px-1 rounded text-xs">supabase/migrations/00009_facturas.sql</code> para crear la tabla de facturas.</> },
                { n: 2, title: 'Obtener certificado digital X.509 en ARCA',
                  body: 'Ingresá a arca.gob.ar con tu CUIT → Administrador de Relaciones → agregá WSFEV1 → descargá el certificado.' },
                { n: 3, title: 'Agregar variables de entorno en Vercel',
                  body: (
                    <div className="mt-1 rounded-lg bg-muted p-3 font-mono text-xs space-y-0.5">
                      <p><span className="text-blue-700">AFIP_CUIT</span>=20xxxxxxxxx8</p>
                      <p><span className="text-blue-700">AFIP_CERT</span>=-----BEGIN CERTIFICATE-----...</p>
                      <p><span className="text-blue-700">AFIP_KEY</span>=-----BEGIN PRIVATE KEY-----...</p>
                      <p><span className="text-blue-700">AFIP_PUNTO_VENTA</span>=1</p>
                      <p><span className="text-blue-700">AFIP_TIPO_CBTE</span>=11 <span className="text-muted-foreground"># 11=Factura C (Monotributista)</span></p>
                      <p><span className="text-blue-700">AFIP_PROD</span>=false <span className="text-muted-foreground"># false=testing</span></p>
                    </div>
                  )},
                { n: 4, title: 'Probar en homologación, luego pasar a producción',
                  body: 'Con AFIP_PROD=false las facturas son de prueba. Cuando todo funcione, cambiá a true.' },
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

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" /> Tipo de factura
            </h2>
            <div className="text-sm space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Factura C (tipo 11)</strong> · Monotributista → consumidor final. La más común para estética.</p>
              <p><strong className="text-foreground">Factura B (tipo 6)</strong> · Resp. Inscripto → consumidor final o monotributista.</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Para clientes sin DNI:</strong> la factura se emite a <em>Consumidor Final</em> (DocTipo=99, DocNro=0). Es válido para montos menores a $10.000.000.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
