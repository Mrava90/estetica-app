'use client'

import { useState } from 'react'
import { formatPrecio } from '@/lib/dates'
import { fechaArYMD } from '@/lib/timezone'
import { FilePlus2, Loader2, X, CheckCircle2, AlertTriangle, Send } from 'lucide-react'

interface Props {
  /** Se llama despues de emitir para que la lista se refresque. */
  onEmitida?: () => void
}

interface Resultado {
  ok: boolean
  cae?: string
  numero_cbte?: number
  error?: string
}

/**
 * Emision de una factura cargando los datos a mano.
 *
 * Para ventas que no estan en el sheet: una clienta que pide factura de algo
 * cobrado fuera del circuito habitual, un ajuste, una venta de producto.
 *
 * Usa el mismo endpoint que el resto (/api/facturacion/generar) con un
 * afip_row_key sintetico "manual-<timestamp>-<rand>", que le da identidad
 * propia sin chocar con las filas del sheet.
 */
export function FacturaManual({ onEmitida }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => fechaArYMD())
  const [descripcion, setDescripcion] = useState('')

  const montoNum = parseFloat(monto.replace(',', '.')) || 0
  const dniLimpio = dni.replace(/\D/g, '')
  const dniValido = dniLimpio === '' || dniLimpio.length === 7 || dniLimpio.length === 8
  const puedeEmitir = montoNum > 0 && fecha !== '' && dniValido && !enviando

  function limpiar() {
    setNombre(''); setDni(''); setMonto(''); setDescripcion('')
    setFecha(fechaArYMD())
    setResultado(null); setConfirmando(false)
  }

  function cerrar() {
    setAbierto(false)
    // Si emitio bien, limpiar para la proxima. Si fallo, dejar los datos.
    if (resultado?.ok) limpiar()
  }

  async function emitir() {
    setEnviando(true)
    setResultado(null)
    try {
      const key = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const res = await fetch('/api/facturacion/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          afip_row_key:    key,
          receptor_nombre: nombre.trim() || 'Consumidor Final',
          receptor_dni:    dniLimpio || null,
          monto:           montoNum,
          fecha,
          descripcion:     descripcion.trim() || 'Servicios de estética',
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setResultado({ ok: false, error: json.error || `Error HTTP ${res.status}` })
      } else {
        setResultado({ ok: true, cae: json.cae, numero_cbte: json.numero_cbte })
        onEmitida?.()
      }
    } catch (e: any) {
      setResultado({ ok: false, error: e?.message || 'No se pudo conectar con el servidor' })
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
        title="Emitir una factura cargando los datos a mano"
      >
        <FilePlus2 className="h-3.5 w-3.5" />
        Factura manual
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-[23rem] rounded-lg border bg-card p-3 shadow-lg space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Nueva factura manual</p>
            <button onClick={cerrar} className="rounded p-0.5 text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Resultado exitoso */}
          {resultado?.ok ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-2.5 space-y-1.5">
              <p className="flex items-center gap-1 text-xs font-semibold text-green-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> Factura emitida
              </p>
              <p className="text-[11px] text-green-700">
                N° <strong>{String(resultado.numero_cbte).padStart(8, '0')}</strong>
                {' · '}CAE <span className="font-mono">{resultado.cae}</span>
              </p>
              <button
                onClick={limpiar}
                className="rounded-md bg-green-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-800 transition-colors"
              >
                Cargar otra
              </button>
            </div>
          ) : (
            <>
              {/* Formulario */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex flex-col gap-0.5 flex-1">
                    <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      placeholder="Consumidor Final"
                      className="h-6 rounded border px-1.5 text-xs bg-background"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 w-28">
                    <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">DNI</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dni}
                      onChange={e => setDni(e.target.value)}
                      placeholder="opcional"
                      className={`h-6 rounded border px-1.5 text-xs bg-background ${!dniValido ? 'border-red-400' : ''}`}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex flex-col gap-0.5 w-28">
                    <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Monto *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      placeholder="0"
                      className="h-6 rounded border px-1.5 text-xs bg-background"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Fecha *</label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      className="h-6 rounded border px-1.5 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Descripción</label>
                  <input
                    type="text"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Servicios de estética"
                    className="h-6 rounded border px-1.5 text-xs bg-background"
                  />
                </div>
              </div>

              {!dniValido && (
                <p className="text-[10px] text-red-600">El DNI tiene que tener 7 u 8 dígitos, o quedar vacío.</p>
              )}
              {!dniLimpio && (
                <p className="text-[10px] text-muted-foreground">Sin DNI se emite a <strong>Consumidor Final</strong>.</p>
              )}

              {/* Error de emisión */}
              {resultado && !resultado.ok && (
                <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 leading-snug">
                  {resultado.error}
                </p>
              )}

              {/* Confirmación */}
              {confirmando ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-2">
                  <p className="flex items-start gap-1 text-[10px] text-amber-900 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                      Se va a emitir en ARCA por <strong>{formatPrecio(montoNum)}</strong> a nombre de{' '}
                      <strong>{nombre.trim() || 'Consumidor Final'}</strong>. No se puede borrar después.
                    </span>
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={emitir}
                      disabled={enviando}
                      className="flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Confirmar y emitir
                    </button>
                    <button
                      onClick={() => setConfirmando(false)}
                      disabled={enviando}
                      className="rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmando(true)}
                  disabled={!puedeEmitir}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Emitir {montoNum > 0 ? formatPrecio(montoNum) : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
