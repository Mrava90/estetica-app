'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/dates'
import { SwitchFacturacionAuto } from '@/components/facturacion/SwitchFacturacionAuto'
import { FacturaManual } from '@/components/facturacion/FacturaManual'
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
  FileText,
  Mail,
  X,
  Pencil,
  Save,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type EstadoFactura = 'pendiente' | 'excluida' | 'emitida' | 'error'
type RowMode = 'idle' | 'confirming' | 'loading'
type TipoPagoMP = 'QR' | 'Point' | 'Transferencia' | 'Link' | 'Dinero en cuenta' | 'Otro'
type MedioPago = 'MercadoPago' | 'Efectivo' | 'Otro'

interface ItemFacturacion {
  afip_row_key: string
  fecha: string
  cliente_nombre: string
  cliente_dni: string | null
  servicio_nombre: string
  monto: number
  medio_pago: MedioPago
  factura_id: string | null
  factura_estado: EstadoFactura | null
  factura_cae: string | null
  factura_numero: string | null
  factura_vencimiento: string | null
  factura_error: string | null
  // Enriquecimiento MercadoPago — null si MP no esta disponible
  tipo_pago: TipoPagoMP | null
  mp_payment_id: number | null
  mp_comision: number | null
  mp_neto: number | null
  mp_match: 'unico' | 'ambiguo' | 'sin_match' | null
}

/** Canales presenciales (cobro en el local). Son los que se facturan automatico. */
const CANALES_PRESENCIALES: TipoPagoMP[] = ['QR', 'Point']

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

/**
 * Badge del canal de cobro.
 * Para MercadoPago muestra el canal fino (QR / Point / Transferencia).
 * Para efectivo muestra un badge propio, porque no tiene canal de MP.
 */
function BadgeCanal({ tipo, match, medio }: {
  tipo: TipoPagoMP | null
  match: ItemFacturacion['mp_match']
  medio?: MedioPago
}) {
  if (medio === 'Efectivo') {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1 py-0 text-[9px] font-medium text-emerald-700 whitespace-nowrap leading-[1.4]"
        title="Cobrado en efectivo">
        <span aria-hidden>$</span> Efectivo
      </span>
    )
  }
  if (medio === 'Otro') {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-gray-200 bg-gray-50 px-1 py-0 text-[9px] font-medium text-gray-600 whitespace-nowrap leading-[1.4]"
        title="Otro medio de pago (ej. gift card)">
        Otro
      </span>
    )
  }
  if (!tipo) return null
  const estilos: Record<TipoPagoMP, string> = {
    'QR':               'bg-violet-100 text-violet-700 border-violet-200',
    'Point':            'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Transferencia':    'bg-slate-100 text-slate-600 border-slate-200',
    'Link':             'bg-cyan-100 text-cyan-700 border-cyan-200',
    'Dinero en cuenta': 'bg-slate-100 text-slate-600 border-slate-200',
    'Otro':             'bg-gray-100 text-gray-600 border-gray-200',
  }
  const iconos: Record<TipoPagoMP, string> = {
    'QR': '▣', 'Point': '▤', 'Transferencia': '⇄', 'Link': '🔗', 'Dinero en cuenta': '●', 'Otro': '·',
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0 text-[9px] font-medium whitespace-nowrap leading-[1.4] ${estilos[tipo]}`}
      title={match === 'ambiguo' ? 'Varios pagos coinciden en fecha y monto — verificá' : `Cobrado por ${tipo}`}
    >
      <span aria-hidden>{iconos[tipo]}</span>
      {tipo}
      {match === 'ambiguo' && <span className="text-amber-600 font-bold" title="Coincidencia ambigua">?</span>}
    </span>
  )
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
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'emitida' | 'excluida'>('todos')
  const [filtroCanal, setFiltroCanal] = useState<'todos' | 'presencial' | 'transferencia' | 'efectivo'>('todos')
  const [mpDisponible, setMpDisponible] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [bulkProgreso, setBulkProgreso] = useState<{ done: number; total: number; errores: number } | null>(null)
  const [emailRow, setEmailRow]       = useState<string | null>(null)
  const [emailInput, setEmailInput]   = useState<Record<string, string>>({})
  const [emailStatus, setEmailStatus] = useState<Record<string, 'idle' | 'loading' | 'sent' | 'error'>>({})
  const [emailError, setEmailError]   = useState<Record<string, string>>({})
  const [editData, setEditData]       = useState<Record<string, { nombre: string; dni: string; descripcion: string }>>({})
  const [editingRow, setEditingRow]   = useState<string | null>(null)

  async function handleEnviarEmail(facturaId: string) {
    const email = (emailInput[facturaId] || '').trim()
    if (!email) return
    setEmailStatus(s => ({ ...s, [facturaId]: 'loading' }))
    setEmailError(s => ({ ...s, [facturaId]: '' }))
    try {
      const res = await fetch('/api/facturacion/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factura_id: facturaId, email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al enviar')
      setEmailStatus(s => ({ ...s, [facturaId]: 'sent' }))
      setTimeout(() => {
        setEmailRow(null)
        setEmailStatus(s => ({ ...s, [facturaId]: 'idle' }))
      }, 2500)
    } catch (e: any) {
      setEmailStatus(s => ({ ...s, [facturaId]: 'error' }))
      setEmailError(s => ({ ...s, [facturaId]: e.message }))
    }
  }

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
    setMpDisponible(Boolean(json.mp_disponible))
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
          receptor_nombre: editData[item.afip_row_key]?.nombre ?? item.cliente_nombre,
          receptor_dni:    editData[item.afip_row_key]?.dni || item.cliente_dni,
          monto:           item.monto,
          fecha:           item.fecha,
          descripcion:     editData[item.afip_row_key]?.descripcion ?? item.servicio_nombre ?? 'Servicio de estética',
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

  /** Enviar múltiples a ARCA en secuencia */
  async function handleBulkEnviarARCA() {
    const keys = [...seleccionados]
    const itemsAEnviar = pendientes.filter(i => keys.includes(i.afip_row_key))
    if (itemsAEnviar.length === 0) return

    setSeleccionados(new Set())
    setBulkProgreso({ done: 0, total: itemsAEnviar.length, errores: 0 })

    let errores = 0
    for (let i = 0; i < itemsAEnviar.length; i++) {
      const item = itemsAEnviar[i]
      setMode(item.afip_row_key, 'loading')
      clearErr(item.afip_row_key)
      try {
        const res = await fetch('/api/facturacion/generar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            afip_row_key:    item.afip_row_key,
            receptor_nombre: editData[item.afip_row_key]?.nombre ?? item.cliente_nombre,
            receptor_dni:    editData[item.afip_row_key]?.dni || item.cliente_dni,
            monto:           item.monto,
            fecha:           item.fecha,
            descripcion:     editData[item.afip_row_key]?.descripcion ?? item.servicio_nombre ?? 'Servicio de estética',
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) {
          setErr(item.afip_row_key, json.error || `Error HTTP ${res.status}`)
          errores++
        }
      } catch {
        setErr(item.afip_row_key, 'No se pudo conectar con el servidor.')
        errores++
      }
      setMode(item.afip_row_key, 'idle')
      setBulkProgreso({ done: i + 1, total: itemsAEnviar.length, errores })
    }

    await fetchData()
    setBulkProgreso(null)
  }

  /** Eliminar múltiples en secuencia */
  async function handleBulkExcluir() {
    const keys = [...seleccionados]
    const itemsAExcluir = pendientes.filter(i => keys.includes(i.afip_row_key))
    if (itemsAExcluir.length === 0) return

    setSeleccionados(new Set())
    setBulkProgreso({ done: 0, total: itemsAExcluir.length, errores: 0 })

    let errores = 0
    for (let i = 0; i < itemsAExcluir.length; i++) {
      const item = itemsAExcluir[i]
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

      if (dbErr) { setErr(item.afip_row_key, dbErr); errores++ }
      setMode(item.afip_row_key, 'idle')
      setBulkProgreso({ done: i + 1, total: itemsAExcluir.length, errores })
    }

    await fetchData()
    setBulkProgreso(null)
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

  // Búsqueda + filtro de estado + filtro de canal de cobro
  const esPresencial = (i: ItemFacturacion) =>
    i.medio_pago === 'MercadoPago' && i.tipo_pago != null && CANALES_PRESENCIALES.includes(i.tipo_pago)
  const esTransferencia = (i: ItemFacturacion) =>
    i.medio_pago === 'MercadoPago' && i.tipo_pago != null && !CANALES_PRESENCIALES.includes(i.tipo_pago)

  function aplicarFiltros(lista: ItemFacturacion[]) {
    return lista.filter(i => {
      if (busqueda && !i.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
      if (filtroCanal === 'presencial') return esPresencial(i)
      if (filtroCanal === 'transferencia') return esTransferencia(i)
      if (filtroCanal === 'efectivo') return i.medio_pago === 'Efectivo'
      return true
    })
  }

  // Totales por canal (para las botoneras y el card de resumen)
  const itemsPresenciales = items.filter(esPresencial)
  const itemsTransferencia = items.filter(esTransferencia)
  const itemsEfectivo = items.filter(i => i.medio_pago === 'Efectivo')
  const montoPresencial = itemsPresenciales.reduce((s, i) => s + i.monto, 0)
  const montoTransferencia = itemsTransferencia.reduce((s, i) => s + i.monto, 0)
  const montoEfectivo = itemsEfectivo.reduce((s, i) => s + i.monto, 0)
  const comisionTotal = items.reduce((s, i) => s + (i.mp_comision ?? 0), 0)
  const itemsMP = items.filter(i => i.medio_pago === 'MercadoPago')
  const montoMP = itemsMP.reduce((s, i) => s + i.monto, 0)
  const sinIdentificar = itemsMP.filter(i => i.tipo_pago == null).length
  const pendientesFiltrados = (filtroEstado === 'todos' || filtroEstado === 'pendiente') ? aplicarFiltros([...pendientes, ...conError]) : []
  const emitidasFiltradas   = (filtroEstado === 'todos' || filtroEstado === 'emitida')   ? aplicarFiltros([...emitidas].sort((a, b) => b.fecha.localeCompare(a.fecha)))   : []
  const excluidasFiltradas  = (filtroEstado === 'todos' || filtroEstado === 'excluida')  ? aplicarFiltros(excluidas)  : []

  const totalMonto     = items.reduce((s, i) => s + i.monto, 0)
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
        <li key={k} className="grid grid-cols-[1.75rem_1fr_auto] md:grid-cols-[1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_9rem] items-center gap-x-2 gap-y-0 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
          {/* Avatar */}
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(item.cliente_nombre)}`}>
            {initials(item.cliente_nombre)}
          </div>
          {/* Nombre */}
          <div className="min-w-0">
            <p className="font-semibold text-xs truncate text-gray-900 leading-tight">{item.cliente_nombre}</p>
          </div>
          {/* DNI */}
          <div className="hidden md:block">
            {item.cliente_dni
              ? <span className="font-mono text-[11px] font-medium text-gray-900">{formatDNI(item.cliente_dni)}</span>
              : <span className="text-[10px] text-gray-500 italic">Sin DNI</span>}
          </div>
          {/* Servicio + canal de cobro */}
          <div className="hidden md:flex items-center gap-1.5 min-w-0">
            <p className="text-[11px] text-gray-700 truncate">{item.servicio_nombre}</p>
            <BadgeCanal tipo={item.tipo_pago} match={item.mp_match} medio={item.medio_pago} />
          </div>
          {/* Fecha */}
          <p className="hidden md:block text-[10px] text-gray-700 text-right">{isoToDisplay(item.fecha)}</p>
          {/* ESTADO */}
          <div className="hidden md:flex justify-center">
            <span className="rounded-full bg-green-200 text-green-800 text-[9px] font-medium px-1.5 py-0.5 whitespace-nowrap">Facturada</span>
          </div>
          {/* Monto */}
          <p className="font-bold text-xs text-right text-gray-900">{formatPrecio(item.monto)}</p>
          {/* Estado */}
          <div className="flex items-center gap-1">
            <div className="flex flex-col items-end gap-0 min-w-[76px]">
              {item.factura_cae ? (
                <>
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-900 whitespace-nowrap leading-tight">
                    <CheckCircle2 className="h-3 w-3 text-green-600" /> N°{item.factura_numero}
                  </span>
                  <span className="font-mono text-[9px] text-gray-700 tracking-tight leading-tight">{item.factura_cae}</span>
                </>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-900 whitespace-nowrap">
                  <CheckCircle2 className="h-3 w-3 text-green-600" /> Facturada
                  <span className="rounded bg-green-200 px-1 text-[9px] font-medium text-green-800">Manual</span>
                </span>
              )}
            </div>
            {item.factura_id && item.factura_cae && (
              <a
                href={`/facturacion/comprobante/${item.factura_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver / descargar comprobante PDF"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-green-300 bg-white text-green-700 hover:bg-green-100 transition-colors"
              >
                <FileText className="h-3 w-3" />
              </a>
            )}
            {item.factura_id && item.factura_cae && (
              <button
                onClick={() => setEmailRow(emailRow === item.factura_id ? null : item.factura_id!)}
                title="Enviar comprobante por email"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-green-300 bg-white text-green-700 hover:bg-green-100 transition-colors"
              >
                <Mail className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Input de email inline */}
          {emailRow === item.factura_id && item.factura_id && (
            <div className="col-span-full mt-2 flex items-center gap-2">
              {emailStatus[item.factura_id] === 'sent' ? (
                <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Comprobante enviado
                </span>
              ) : (
                <>
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={emailInput[item.factura_id] || ''}
                    onChange={e => setEmailInput(s => ({ ...s, [item.factura_id!]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleEnviarEmail(item.factura_id!)}
                    className="h-8 flex-1 rounded-md border border-green-300 bg-white dark:bg-zinc-800 dark:text-white dark:border-green-700 dark:placeholder-zinc-400 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleEnviarEmail(item.factura_id!)}
                    disabled={emailStatus[item.factura_id] === 'loading'}
                    className="flex h-8 items-center gap-1.5 rounded-md bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
                  >
                    {emailStatus[item.factura_id] === 'loading'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    Enviar
                  </button>
                  <button
                    onClick={() => setEmailRow(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {emailStatus[item.factura_id] === 'error' && (
                    <span className="text-xs text-red-600">{emailError[item.factura_id]}</span>
                  )}
                </>
              )}
            </div>
          )}
        </li>
      )
    }

    // ── Excluida ─────────────────────────────────────────────────────────────
    if (item.factura_estado === 'excluida') {
      return (
        <li key={k} className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-2.5 py-1 opacity-50">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-[9px] font-bold">
            {initials(item.cliente_nombre)}
          </div>
          <p className="flex-1 text-xs line-through truncate">{item.cliente_nombre}</p>
          {item.cliente_dni && <span className="hidden md:block font-mono text-[10px] line-through text-muted-foreground">{formatDNI(item.cliente_dni)}</span>}
          <p className="text-xs font-medium line-through text-muted-foreground">{formatPrecio(item.monto)}</p>
          <button onClick={() => handleRestaurar(item)} disabled={mode === 'loading'}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 whitespace-nowrap">
            {mode === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Restaurar
          </button>
        </li>
      )
    }

    // ── Loading ──────────────────────────────────────────────────────────────
    if (mode === 'loading') {
      return (
        <li key={k} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 opacity-60">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <p className="flex-1 text-xs font-medium">{item.cliente_nombre}</p>
          <p className="text-[10px] text-muted-foreground">Procesando…</p>
          <p className="font-semibold text-xs">{formatPrecio(item.monto)}</p>
        </li>
      )
    }

    // ── Confirmando ──────────────────────────────────────────────────────────
    if (mode === 'confirming') {
      return (
        <li key={k} className="flex flex-col gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 px-3 py-2.5">
          {/* Resumen del ítem */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs">{item.cliente_nombre}</p>
            </div>
            {item.cliente_dni
              ? <span className="font-mono text-[11px] font-semibold bg-white border rounded px-1.5 py-0.5">{formatDNI(item.cliente_dni)}</span>
              : <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Sin DNI · Cons. Final</span>}
            <p className="font-bold text-sm ml-auto">{formatPrecio(item.monto)}</p>
          </div>

          {/* Opciones */}
          <p className="text-[11px] text-blue-700 font-medium">¿Qué querés hacer con esta factura?</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleEnviarARCA(item)}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar a ARCA
            </button>
            <button
              onClick={() => handleMarcarManual(item)}
              className="flex items-center gap-1.5 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ya fue facturada
            </button>
            <button
              onClick={() => setMode(k, 'idle')}
              className="flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>

          {/* Aclaración */}
          <p className="text-[10px] text-muted-foreground leading-snug">
            <strong>Enviar a ARCA</strong> genera el CAE automáticamente. · <strong>Ya fue facturada</strong> marca el ítem
            como procesado sin conectarse a ARCA (para facturas emitidas a mano desde la web de AFIP).
          </p>
        </li>
      )
    }

    // ── Error ────────────────────────────────────────────────────────────────
    if (err || item.factura_estado === 'error') {
      const msg = err || item.factura_error || 'Error desconocido'
      return (
        <li key={k} className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(item.cliente_nombre)}`}>
              {initials(item.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs">{item.cliente_nombre}</p>
              <p className="text-[10px] text-red-600 leading-snug">{msg}</p>
            </div>
            {item.cliente_dni && <span className="font-mono text-[11px] text-muted-foreground">{formatDNI(item.cliente_dni)}</span>}
            <p className="font-bold text-xs">{formatPrecio(item.monto)}</p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => handleCheckClick(k)}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-blue-700 transition-colors">
              <RotateCcw className="h-2.5 w-2.5" /> Reintentar
            </button>
            <button onClick={() => handleExcluir(item)}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium hover:bg-muted transition-colors">
              <XCircle className="h-2.5 w-2.5" /> Descartar
            </button>
          </div>
        </li>
      )
    }

    // ── Pendiente (idle) ─────────────────────────────────────────────────────
    return (
      <li key={k} className="grid grid-cols-[1rem_1.75rem_1fr_auto_auto] md:grid-cols-[1rem_1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_6rem] items-center gap-x-2 rounded-lg border bg-card px-2.5 py-1.5 hover:bg-muted/20 transition-colors">

        {/* Checkbox */}
        <input type="checkbox"
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
          checked={seleccionados.has(k)}
          onChange={e => setSeleccionados(prev => {
            const next = new Set(prev)
            e.target.checked ? next.add(k) : next.delete(k)
            return next
          })}
        />

        {/* Avatar */}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(item.cliente_nombre)}`}>
          {initials(item.cliente_nombre)}
        </div>

        {/* Nombre */}
        <div className="min-w-0">
          <p className="font-semibold text-xs truncate leading-tight">{item.cliente_nombre}</p>
          {/* DNI + canal visibles en mobile (debajo del nombre) */}
          <div className="md:hidden flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {item.cliente_dni ? formatDNI(item.cliente_dni) : <span className="text-amber-600">Sin DNI</span>}
            </span>
            <BadgeCanal tipo={item.tipo_pago} match={item.mp_match} medio={item.medio_pago} />
          </div>
        </div>

        {/* DNI — columna separada en desktop */}
        <div className="hidden md:flex items-center">
          {item.cliente_dni ? (
            <span className="font-mono text-[11px] font-semibold text-gray-800 bg-gray-100 rounded px-1.5 py-0.5">
              {formatDNI(item.cliente_dni)}
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
              Sin DNI
            </span>
          )}
        </div>

        {/* Servicio + canal de cobro */}
        <div className="hidden md:flex items-center gap-1.5 min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{item.servicio_nombre}</p>
          <BadgeCanal tipo={item.tipo_pago} match={item.mp_match} medio={item.medio_pago} />
        </div>

        {/* Fecha */}
        <p className="hidden md:block text-[10px] text-muted-foreground text-right whitespace-nowrap">{isoToDisplay(item.fecha)}</p>

        {/* ESTADO */}
        <div className="hidden md:flex justify-center">
          <span className="rounded-full bg-amber-100 text-amber-700 text-[9px] font-medium px-1.5 py-0.5 whitespace-nowrap">Pendiente</span>
        </div>

        {/* Monto */}
        <p className="font-bold text-xs text-right whitespace-nowrap">{formatPrecio(item.monto)}</p>

        {/* Botones ✓ / ✗ / editar */}
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => {
              setEditingRow(k)
              if (!editData[k]) setEditData(s => ({ ...s, [k]: {
                nombre: item.cliente_nombre,
                dni: item.cliente_dni ?? '',
                descripcion: item.servicio_nombre ?? '',
              }}))
            }}
            title="Editar datos"
            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => handleCheckClick(k)}
            title="Aprobar / marcar como facturada"
            className="flex h-6 w-6 items-center justify-center rounded border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleExcluir(item)}
            title="No facturar este ítem"
            className="flex h-6 w-6 items-center justify-center rounded border border-red-300 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Panel de edición inline */}
        {editingRow === k && editData[k] && (
          <div className="col-span-full mt-1.5 flex flex-wrap items-end gap-1.5 border-t pt-2">
            <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
              <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Nombre</label>
              <input
                type="text"
                value={editData[k].nombre}
                onChange={e => setEditData(s => ({ ...s, [k]: { ...s[k], nombre: e.target.value } }))}
                className="h-6 rounded border px-1.5 text-xs bg-background"
              />
            </div>
            <div className="flex flex-col gap-0.5 w-28">
              <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">DNI</label>
              <input
                type="text"
                value={editData[k].dni}
                onChange={e => setEditData(s => ({ ...s, [k]: { ...s[k], dni: e.target.value } }))}
                placeholder="Sin DNI"
                className="h-6 rounded border px-1.5 text-xs bg-background"
              />
            </div>
            <div className="flex flex-col gap-0.5 flex-[2] min-w-[150px]">
              <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Servicio / Descripción</label>
              <input
                type="text"
                value={editData[k].descripcion}
                onChange={e => setEditData(s => ({ ...s, [k]: { ...s[k], descripcion: e.target.value } }))}
                className="h-6 rounded border px-1.5 text-xs bg-background"
              />
            </div>
            <button
              onClick={() => setEditingRow(null)}
              className="flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Save className="h-3 w-3" /> Guardar
            </button>
            <button
              onClick={() => { setEditingRow(null); setEditData(s => { const n = { ...s }; delete n[k]; return n }) }}
              className="flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </li>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="space-y-3 p-4">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-1.5">
            <Receipt className="h-4.5 w-4.5 text-blue-600" />
            Facturación Electrónica
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Datos desde hoja "Afip" · Solo MercadoPago · Aprobación manual por ítem
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-1.5">
          <FacturaManual onEmitida={fetchData} />
          <SwitchFacturacionAuto />
          <div className="flex gap-0.5 rounded-md border bg-muted p-0.5 self-start">
            <button onClick={() => setTab('lista')}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${tab === 'lista' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Receipt className="h-3 w-3" /> Lista
            </button>
            <button onClick={() => setTab('configuracion')}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${tab === 'configuracion' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Settings2 className="h-3 w-3" /> Config ARCA
            </button>
          </div>
        </div>
      </div>

      {/* ── TAB: Lista ───────────────────────────────────────────────────────── */}
      {tab === 'lista' && (
        <>
          {/* Selector de mes + búsqueda + filtro */}
          <div className="flex flex-col sm:flex-row flex-wrap items-start gap-2">
            <div className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 self-start w-fit">
              <button onClick={mesAnterior} className="rounded p-0.5 hover:bg-muted transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="w-32 text-center font-medium capitalize text-xs">{mesLabel(mesBase)}</span>
              <button onClick={mesSiguiente} className="rounded p-0.5 hover:bg-muted transition-colors">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="pl-7 pr-2 py-1 w-40 rounded-md border bg-card text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Filtro de estado */}
            <div className="flex gap-0.5 rounded-md border bg-muted p-0.5 self-start">
              <button onClick={() => setFiltroEstado('todos')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${filtroEstado === 'todos' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Todos
              </button>
              <button onClick={() => setFiltroEstado('pendiente')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${filtroEstado === 'pendiente' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Pendientes
              </button>
              <button onClick={() => setFiltroEstado('emitida')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors leading-tight ${filtroEstado === 'emitida' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <span className="block">Facturadas</span>
                {montoEmitido > 0 && (
                  <span className="block text-[9px] font-normal text-green-600">{formatPrecio(montoEmitido)}</span>
                )}
              </button>
              {excluidas.length > 0 && (
                <button onClick={() => setFiltroEstado('excluida')}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors leading-tight ${filtroEstado === 'excluida' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  <span className="block">Eliminadas</span>
                  <span className="block text-[9px] font-normal">{excluidas.length}</span>
                </button>
              )}
            </div>

            {/* Filtro por medio de pago / canal */}
            <div className="flex gap-0.5 rounded-md border border-violet-200 bg-violet-50 p-0.5 self-start">
              <button onClick={() => setFiltroCanal('todos')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${filtroCanal === 'todos' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'}`}>
                Todos
              </button>
              {mpDisponible && (
                <>
                  <button onClick={() => setFiltroCanal('presencial')}
                    title="Cobros presenciales con MercadoPago (QR y posnet Point)"
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors leading-tight ${filtroCanal === 'presencial' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'}`}>
                    <span className="block">▣ QR / Point</span>
                    <span className={`block text-[9px] font-normal ${filtroCanal === 'presencial' ? 'text-violet-100' : 'text-violet-500'}`}>
                      {itemsPresenciales.length} · {formatPrecio(montoPresencial)}
                    </span>
                  </button>
                  <button onClick={() => setFiltroCanal('transferencia')}
                    title="Transferencias al alias / CVU"
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors leading-tight ${filtroCanal === 'transferencia' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'}`}>
                    <span className="block">⇄ Transferencia</span>
                    <span className={`block text-[9px] font-normal ${filtroCanal === 'transferencia' ? 'text-violet-100' : 'text-violet-500'}`}>
                      {itemsTransferencia.length} · {formatPrecio(montoTransferencia)}
                    </span>
                  </button>
                </>
              )}
              {itemsEfectivo.length > 0 && (
                <button onClick={() => setFiltroCanal('efectivo')}
                  title="Ventas cobradas en efectivo — se facturan solo a pedido de la clienta"
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors leading-tight ${filtroCanal === 'efectivo' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-100'}`}>
                  <span className="block">$ Efectivo</span>
                  <span className={`block text-[9px] font-normal ${filtroCanal === 'efectivo' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                    {itemsEfectivo.length} · {formatPrecio(montoEfectivo)}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Aviso cuando el filtro de canal está activo */}
          {filtroCanal !== 'todos' && (
            <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${
              filtroCanal === 'efectivo'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-violet-200 bg-violet-50 text-violet-800'
            }`}>
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>
                Solo <strong>{
                  filtroCanal === 'presencial' ? 'QR / Point'
                  : filtroCanal === 'efectivo' ? 'ventas en efectivo'
                  : 'transferencias'
                }</strong>.
                {filtroCanal === 'efectivo'
                  ? ' El efectivo nunca se factura automático — se emite solo si la clienta lo pide.'
                  : ' Al seleccionar todas, el envío masivo a ARCA incluye únicamente estas.'}
              </span>
              <button onClick={() => setFiltroCanal('todos')} className="ml-auto shrink-0 underline hover:no-underline">
                Quitar
              </button>
            </div>
          )}

          {/* Stats */}
          {!loading && items.length > 0 && (
            <div className={`grid gap-2 ${mpDisponible ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
              <div className="rounded-lg border bg-card px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground leading-tight">Total del mes</p>
                <p className="text-base font-bold text-blue-700 leading-tight">{formatPrecio(totalMonto)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {itemsEfectivo.length > 0
                    ? <>MP {formatPrecio(montoMP)} · Efvo {formatPrecio(montoEfectivo)}</>
                    : <>{items.length} ítems</>}
                </p>
              </div>
              <div className="rounded-lg border bg-card px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground leading-tight">Pendientes</p>
                <p className="text-base font-bold text-amber-700 leading-tight">{pendientes.length + conError.length}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{formatPrecio(montoPendiente)}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
                <p className="text-[10px] text-green-700 leading-tight">Facturadas</p>
                <p className="text-base font-bold text-green-700 leading-tight">{emitidas.length}</p>
                <p className="text-[10px] text-green-600 leading-tight">{formatPrecio(montoEmitido)}</p>
              </div>
              {mpDisponible && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5">
                  <p className="text-[10px] text-violet-700 leading-tight">Comisiones MP</p>
                  <p className="text-base font-bold text-violet-700 leading-tight">{formatPrecio(comisionTotal)}</p>
                  <p className="text-[10px] text-violet-600 leading-tight">
                    {totalMonto > 0 ? `${((comisionTotal / totalMonto) * 100).toFixed(2)}%` : '—'}
                    {sinIdentificar > 0 && ` · ${sinIdentificar} s/ident.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error de carga */}
          {fetchError && (
            <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {fetchError}
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando hoja Afip…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              <Receipt className="h-7 w-7 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Sin registros en la hoja "Afip"</p>
              <p className="text-sm mt-1">No hay filas para este mes en el Google Sheet.</p>
            </div>
          ) : (pendientesFiltrados.length === 0 && emitidasFiltradas.length === 0 && excluidasFiltradas.length === 0) ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm mt-1">Probá con otro nombre o filtro.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Encabezado de columnas (desktop) — pendientes */}
              {pendientesFiltrados.length > 0 && (
                <div className="hidden md:grid grid-cols-[1rem_1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_6rem] items-center gap-x-2 px-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <input type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
                    checked={pendientesFiltrados.length > 0 && pendientesFiltrados.every(i => seleccionados.has(i.afip_row_key))}
                    onChange={e => {
                      const keys = pendientesFiltrados.map(i => i.afip_row_key)
                      setSeleccionados(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) keys.forEach(k => next.add(k))
                        else keys.forEach(k => next.delete(k))
                        return next
                      })
                    }}
                  />
                  <span />
                  <span>Cliente</span>
                  <span>DNI</span>
                  <span>Servicio / Canal</span>
                  <span className="text-right">Fecha</span>
                  <span className="text-center">Estado</span>
                  <span className="text-right">Monto</span>
                  <span className="text-right">Acción</span>
                </div>
              )}

              {/* Pendientes + errores */}
              {pendientesFiltrados.length > 0 && (
                <ul className="space-y-1">
                  {pendientesFiltrados.map(item => renderFila(item))}
                </ul>
              )}

              {/* Emitidas */}
              {emitidasFiltradas.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="hidden md:grid grid-cols-[1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_9rem] items-center gap-x-2 px-2.5 text-[10px] font-semibold text-green-700 uppercase tracking-wide">
                    <span />
                    <span>Cliente</span>
                    <span>DNI</span>
                    <span>Servicio</span>
                    <span className="text-right">Fecha</span>
                    <span className="text-center">Estado</span>
                    <span className="text-right">Monto</span>
                    <span className="text-right">Comprobante</span>
                  </div>
                  <ul className="space-y-1">{emitidasFiltradas.map(item => renderFila(item))}</ul>
                </div>
              )}

              {/* Excluidas */}
              {excluidasFiltradas.length > 0 && filtroEstado !== 'todos' && (
                <div className="space-y-1 pt-1">
                  <ul className="space-y-1">{excluidasFiltradas.map(item => renderFila(item))}</ul>
                </div>
              )}
              {/* Excluidas colapsable (solo en vista "todos") */}
              {excluidas.length > 0 && filtroEstado === 'todos' && (
                <div className="space-y-1 pt-1">
                  <button onClick={() => setMostrarExcluidas(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mostrarExcluidas ? 'rotate-180' : ''}`} />
                    {mostrarExcluidas ? 'Ocultar' : 'Ver'} descartadas ({excluidas.length})
                  </button>
                  {mostrarExcluidas && (
                    <ul className="space-y-1">{excluidas.map(item => renderFila(item))}</ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Barra de acción bulk */}
      {bulkProgreso ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 shadow-2xl text-white">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span className="text-sm font-medium">
            Procesando {bulkProgreso.done}/{bulkProgreso.total}…
            {bulkProgreso.errores > 0 && (
              <span className="text-red-400 ml-2">({bulkProgreso.errores} error{bulkProgreso.errores > 1 ? 'es' : ''})</span>
            )}
          </span>
        </div>
      ) : seleccionados.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl bg-gray-900 px-3.5 py-2 shadow-2xl text-white">
          <span className="text-sm font-medium">
            {seleccionados.size} seleccionada{seleccionados.size > 1 ? 's' : ''}
            {' · '}
            {formatPrecio([...seleccionados].reduce((sum, key) => {
              const it = pendientes.find(i => i.afip_row_key === key)
              return sum + (it?.monto ?? 0)
            }, 0))}
          </span>
          <button onClick={handleBulkEnviarARCA}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1 text-xs font-semibold hover:bg-blue-400 transition-colors">
            <Send className="h-4 w-4" />
            Enviar a ARCA
          </button>
          <button onClick={handleBulkExcluir}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold hover:bg-red-500 transition-colors">
            <XCircle className="h-4 w-4" />
            Eliminar
          </button>
          <button onClick={() => setSeleccionados(new Set())}
            className="text-xs text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
        </div>
      ) : null}

      {/* ── TAB: Configuración ───────────────────────────────────────────────── */}
      {tab === 'configuracion' && (
        <div className="space-y-3 max-w-2xl text-sm">

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
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

          <div className="rounded-lg border bg-card p-3 space-y-3">
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
          <div className="rounded-lg border bg-card p-3 space-y-2">
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

          <div className="rounded-lg border bg-card p-3 space-y-2">
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
