'use client'

import { formatPrecio } from '@/lib/dates'
import { BadgeCanal } from '@/components/facturacion/BadgeCanal'
import { avatarColor, formatDNI, initials, isoToDisplay } from '@/app/(dashboard)/facturacion/helpers'
import type { EdicionFila, ItemFacturacion, RowMode } from '@/app/(dashboard)/facturacion/tipos'
import {
  CheckCircle2, XCircle, Loader2, RotateCcw, Send, FileText, Mail, X, Pencil, Save,
} from 'lucide-react'

export type EmailStatus = 'idle' | 'loading' | 'sent' | 'error'

export interface FilaFacturaProps {
  item: ItemFacturacion
  /** Estado transitorio de la fila (rowMode del padre). */
  mode: RowMode
  /** Error de la ultima accion sobre esta fila (rowError del padre). */
  err?: string

  // ── Envio del comprobante por email ────────────────────────────────────
  emailAbierto: boolean
  emailValor: string
  emailStatus: EmailStatus
  emailError?: string
  onToggleEmail: (facturaId: string) => void
  onCambiarEmail: (facturaId: string, valor: string) => void
  onEnviarEmail: (facturaId: string) => void
  onCerrarEmail: () => void

  // ── Seleccion para acciones masivas ────────────────────────────────────
  seleccionado: boolean
  onSeleccionar: (key: string, checked: boolean) => void

  // ── Edicion inline de los datos del receptor ───────────────────────────
  editando: boolean
  edicion?: EdicionFila
  onAbrirEdicion: (item: ItemFacturacion) => void
  onCambiarEdicion: (key: string, patch: Partial<EdicionFila>) => void
  onGuardarEdicion: () => void
  onDescartarEdicion: (key: string) => void

  // ── Acciones ───────────────────────────────────────────────────────────
  onCheckClick: (key: string) => void
  onEnviarARCA: (item: ItemFacturacion) => void
  onMarcarManual: (item: ItemFacturacion) => void
  onExcluir: (item: ItemFacturacion) => void
  onRestaurar: (item: ItemFacturacion) => void
  onCancelarConfirmacion: (key: string) => void
}

/**
 * Una fila de la lista de facturacion.
 *
 * Tiene varias caras segun el estado: emitida, excluida, procesando,
 * pidiendo confirmacion, con error, o pendiente. El orden de los `if`
 * define la precedencia.
 *
 * Es puramente presentacional: todo el estado y los handlers vienen del
 * padre, asi la pagina sigue siendo la unica duena de los datos.
 */
export function FilaFactura(props: FilaFacturaProps) {
  const { item, mode, err } = props
  const k = item.afip_row_key

  // ── Emitida ──────────────────────────────────────────────────────────────
  if (item.factura_estado === 'emitida') {
    return (
      <li className="grid grid-cols-[1.75rem_1fr_auto] md:grid-cols-[1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_9rem] items-center gap-x-2 gap-y-0 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
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
        {/* Comprobante */}
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
              onClick={() => props.onToggleEmail(item.factura_id!)}
              title="Enviar comprobante por email"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-green-300 bg-white text-green-700 hover:bg-green-100 transition-colors"
            >
              <Mail className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* Input de email inline */}
        {props.emailAbierto && item.factura_id && (
          <div className="col-span-full mt-2 flex items-center gap-2">
            {props.emailStatus === 'sent' ? (
              <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Comprobante enviado
              </span>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={props.emailValor}
                  onChange={e => props.onCambiarEmail(item.factura_id!, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && props.onEnviarEmail(item.factura_id!)}
                  className="h-8 flex-1 rounded-md border border-green-300 bg-white dark:bg-zinc-800 dark:text-white dark:border-green-700 dark:placeholder-zinc-400 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
                <button
                  onClick={() => props.onEnviarEmail(item.factura_id!)}
                  disabled={props.emailStatus === 'loading'}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
                >
                  {props.emailStatus === 'loading'
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
                <button
                  onClick={props.onCerrarEmail}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                {props.emailStatus === 'error' && (
                  <span className="text-xs text-red-600">{props.emailError}</span>
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
      <li className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-2.5 py-1 opacity-50">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-[9px] font-bold">
          {initials(item.cliente_nombre)}
        </div>
        <p className="flex-1 text-xs line-through truncate">{item.cliente_nombre}</p>
        {item.cliente_dni && <span className="hidden md:block font-mono text-[10px] line-through text-muted-foreground">{formatDNI(item.cliente_dni)}</span>}
        <p className="text-xs font-medium line-through text-muted-foreground">{formatPrecio(item.monto)}</p>
        <button onClick={() => props.onRestaurar(item)} disabled={mode === 'loading'}
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
      <li className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 opacity-60">
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
      <li className="flex flex-col gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 px-3 py-2.5">
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
            onClick={() => props.onEnviarARCA(item)}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar a ARCA
          </button>
          <button
            onClick={() => props.onMarcarManual(item)}
            className="flex items-center gap-1.5 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ya fue facturada
          </button>
          <button
            onClick={() => props.onCancelarConfirmacion(k)}
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
      <li className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
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
          <button onClick={() => props.onCheckClick(k)}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-blue-700 transition-colors">
            <RotateCcw className="h-2.5 w-2.5" /> Reintentar
          </button>
          <button onClick={() => props.onExcluir(item)}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium hover:bg-muted transition-colors">
            <XCircle className="h-2.5 w-2.5" /> Descartar
          </button>
        </div>
      </li>
    )
  }

  // ── Pendiente (idle) ─────────────────────────────────────────────────────
  return (
    <li className="grid grid-cols-[1rem_1.75rem_1fr_auto_auto] md:grid-cols-[1rem_1.75rem_1.5fr_1fr_1.5fr_3.75rem_4.5rem_5rem_6rem] items-center gap-x-2 rounded-lg border bg-card px-2.5 py-1.5 hover:bg-muted/20 transition-colors">

      {/* Checkbox */}
      <input type="checkbox"
        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
        checked={props.seleccionado}
        onChange={e => props.onSeleccionar(k, e.target.checked)}
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
          onClick={() => props.onAbrirEdicion(item)}
          title="Editar datos"
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => props.onCheckClick(k)}
          title="Aprobar / marcar como facturada"
          className="flex h-6 w-6 items-center justify-center rounded border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => props.onExcluir(item)}
          title="No facturar este ítem"
          className="flex h-6 w-6 items-center justify-center rounded border border-red-300 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Panel de edición inline */}
      {props.editando && props.edicion && (
        <div className="col-span-full mt-1.5 flex flex-wrap items-end gap-1.5 border-t pt-2">
          <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
            <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Nombre</label>
            <input
              type="text"
              value={props.edicion.nombre}
              onChange={e => props.onCambiarEdicion(k, { nombre: e.target.value })}
              className="h-6 rounded border px-1.5 text-xs bg-background"
            />
          </div>
          <div className="flex flex-col gap-0.5 w-28">
            <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">DNI</label>
            <input
              type="text"
              value={props.edicion.dni}
              onChange={e => props.onCambiarEdicion(k, { dni: e.target.value })}
              placeholder="Sin DNI"
              className="h-6 rounded border px-1.5 text-xs bg-background"
            />
          </div>
          <div className="flex flex-col gap-0.5 flex-[2] min-w-[150px]">
            <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Servicio / Descripción</label>
            <input
              type="text"
              value={props.edicion.descripcion}
              onChange={e => props.onCambiarEdicion(k, { descripcion: e.target.value })}
              className="h-6 rounded border px-1.5 text-xs bg-background"
            />
          </div>
          <button
            onClick={props.onGuardarEdicion}
            className="flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Save className="h-3 w-3" /> Guardar
          </button>
          <button
            onClick={() => props.onDescartarEdicion(k)}
            className="flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </li>
  )
}
