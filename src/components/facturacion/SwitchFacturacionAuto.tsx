'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/dates'
import { formatAR } from '@/lib/timezone'
import { Zap, Loader2, AlertTriangle, Check, ChevronDown } from 'lucide-react'

interface ConfigAuto {
  facturacion_auto_qr: boolean
  facturacion_auto_monto_max: number
  facturacion_auto_ultimo_run: string | null
  facturacion_auto_ultimo_resultado: string | null
  facturacion_auto_ultimo_error: string | null
}

export function SwitchFacturacionAuto() {
  const supabase = createClient()
  const [config, setConfig] = useState<ConfigAuto | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [montoInput, setMontoInput] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    supabase
      .from('configuracion')
      .select('facturacion_auto_qr, facturacion_auto_monto_max, facturacion_auto_ultimo_run, facturacion_auto_ultimo_resultado, facturacion_auto_ultimo_error')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) {
          setConfig(data as ConfigAuto)
          setMontoInput(String(data.facturacion_auto_monto_max ?? 100000))
        }
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar(patch: Partial<ConfigAuto>) {
    setSaving(true)
    const { error } = await supabase.from('configuracion').update(patch).eq('id', 1)
    setSaving(false)
    if (!error && config) setConfig({ ...config, ...patch })
  }

  function toggle() {
    if (!config) return
    // Prender pide confirmacion: emitir facturas en ARCA es irreversible.
    if (!config.facturacion_auto_qr) {
      setConfirmando(true)
      setAbierto(true)
      return
    }
    guardar({ facturacion_auto_qr: false })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
      </div>
    )
  }
  if (!config) return null

  const activo = config.facturacion_auto_qr

  return (
    <div className="relative">
      <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        activo ? 'border-amber-300 bg-amber-50' : 'border-border bg-card'
      }`}>
        <Zap className={`h-4 w-4 shrink-0 ${activo ? 'text-amber-600' : 'text-muted-foreground'}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium leading-tight ${activo ? 'text-amber-900' : 'text-foreground'}`}>
            Facturación automática
          </p>
          <p className={`text-[11px] leading-tight ${activo ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {activo ? 'Activa · solo ventas QR' : 'Desactivada'}
          </p>
        </div>

        {/* Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          onClick={toggle}
          disabled={saving}
          title={activo ? 'Desactivar facturación automática' : 'Activar facturación automática'}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            activo ? 'bg-amber-500' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            activo ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>

        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted transition-colors"
          title="Ver detalles"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Panel desplegable */}
      {abierto && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[26rem] rounded-xl border bg-card p-4 shadow-lg space-y-4">

          {/* Confirmación al activar */}
          {confirmando && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> Antes de activar
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Las facturas emitidas en ARCA <strong>no se pueden borrar</strong> — para anular una hay que
                emitir una nota de crédito. El proceso corre <strong>una vez por día a las 9 AM</strong> y solo
                factura ventas que cumplan todas las condiciones de abajo.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { guardar({ facturacion_auto_qr: true }); setConfirmando(false) }}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Entendido, activar
                </button>
                <button
                  onClick={() => setConfirmando(false)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Condiciones */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solo se factura si</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="flex gap-1.5"><span className="text-green-600">✓</span> El cobro entró por <strong className="text-foreground">QR de MercadoPago</strong></li>
              <li className="flex gap-1.5"><span className="text-green-600">✓</span> El cruce con MP es <strong className="text-foreground">único</strong> (no ambiguo)</li>
              <li className="flex gap-1.5"><span className="text-green-600">✓</span> No tiene factura ni fue descartada</li>
              <li className="flex gap-1.5"><span className="text-green-600">✓</span> El monto no supera el tope de abajo</li>
            </ul>
            <p className="text-[11px] text-muted-foreground pt-1">
              Las transferencias, el posnet Point y las ventas ambiguas <strong>nunca</strong> se facturan solas.
            </p>
          </div>

          {/* Tope de monto */}
          <div className="space-y-1.5 border-t pt-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tope por factura
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                value={montoInput}
                onChange={e => setMontoInput(e.target.value)}
                min={0}
                step={1000}
                className="h-8 flex-1 rounded-md border px-2 text-sm bg-background"
              />
              {Number(montoInput) !== config.facturacion_auto_monto_max && (
                <button
                  onClick={() => guardar({ facturacion_auto_monto_max: Number(montoInput) || 100000 })}
                  disabled={saving}
                  className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Una venta QR de más de {formatPrecio(config.facturacion_auto_monto_max)} queda pendiente para que la revises a mano.
            </p>
          </div>

          {/* Última corrida */}
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última corrida</p>
            {config.facturacion_auto_ultimo_run ? (
              <>
                <p className="text-xs text-foreground">
                  {formatAR(config.facturacion_auto_ultimo_run, "d 'de' MMMM 'a las' HH:mm")}
                  {' · '}
                  <span className="text-muted-foreground">{config.facturacion_auto_ultimo_resultado || '—'}</span>
                </p>
                {config.facturacion_auto_ultimo_error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 leading-snug">
                    <strong>Se frenó por un error:</strong> {config.facturacion_auto_ultimo_error}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no corrió.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
