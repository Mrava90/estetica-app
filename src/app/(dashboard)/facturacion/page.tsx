'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/dates'
import { SwitchFacturacionAuto } from '@/components/facturacion/SwitchFacturacionAuto'
import { FacturaManual } from '@/components/facturacion/FacturaManual'
import { ConfigArca } from '@/components/facturacion/ConfigArca'
import { FilaFactura, type FilaFacturaProps } from '@/components/facturacion/FilaFactura'
import { mesLabel } from './helpers'
import { CANALES_PRESENCIALES, type EdicionFila, type ItemFacturacion, type RowMode } from './tipos'
import {
  Receipt,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Settings2,
  Info,
  ChevronDown,
  Send,
  Search,
  XCircle,
} from 'lucide-react'

export default function FacturacionPage() {
  const supabase = createClient()

  const [tab, setTab] = useState<'lista' | 'configuracion'>('lista')
  const [items, setItems] = useState<ItemFacturacion[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rowMode, setRowMode] = useState<Record<string, RowMode>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false)
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
  const [editData, setEditData]       = useState<Record<string, EdicionFila>>({})
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

  // ── Props de una fila ─────────────────────────────────────────────────────
  // La fila es presentacional: todo su estado y sus acciones salen de aca.

  function propsDeFila(item: ItemFacturacion): FilaFacturaProps {
    const k = item.afip_row_key
    const fid = item.factura_id ?? ''
    return {
      item,
      mode: rowMode[k] || 'idle',
      err:  rowError[k],

      emailAbierto:   Boolean(item.factura_id) && emailRow === item.factura_id,
      emailValor:     emailInput[fid] || '',
      emailStatus:    emailStatus[fid] || 'idle',
      emailError:     emailError[fid],
      onToggleEmail:  id => setEmailRow(emailRow === id ? null : id),
      onCambiarEmail: (id, valor) => setEmailInput(s => ({ ...s, [id]: valor })),
      onEnviarEmail:  handleEnviarEmail,
      onCerrarEmail:  () => setEmailRow(null),

      seleccionado:  seleccionados.has(k),
      onSeleccionar: (key, checked) => setSeleccionados(prev => {
        const next = new Set(prev)
        if (checked) next.add(key)
        else next.delete(key)
        return next
      }),

      editando: editingRow === k,
      edicion:  editData[k],
      onAbrirEdicion: it => {
        const key = it.afip_row_key
        setEditingRow(key)
        setEditData(s => s[key] ? s : { ...s, [key]: {
          nombre: it.cliente_nombre,
          dni: it.cliente_dni ?? '',
          descripcion: it.servicio_nombre ?? '',
        } })
      },
      onCambiarEdicion: (key, patch) => setEditData(s => ({ ...s, [key]: { ...s[key], ...patch } })),
      onGuardarEdicion: () => setEditingRow(null),
      onDescartarEdicion: key => {
        setEditingRow(null)
        setEditData(s => { const n = { ...s }; delete n[key]; return n })
      },

      onCheckClick:           handleCheckClick,
      onEnviarARCA:           handleEnviarARCA,
      onMarcarManual:         handleMarcarManual,
      onExcluir:              handleExcluir,
      onRestaurar:            handleRestaurar,
      onCancelarConfirmacion: key => setMode(key, 'idle'),
    }
  }

  const renderFila = (item: ItemFacturacion) =>
    <FilaFactura key={item.afip_row_key} {...propsDeFila(item)} />

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
      {tab === 'configuracion' && <ConfigArca />}
    </div>
  )
}
