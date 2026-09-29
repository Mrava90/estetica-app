'use client'

import { useState } from 'react'
import { formatPrecio } from '@/lib/dates'
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react'

/**
 * Cruce del mes contra lo que ARCA tiene emitido. Solo lectura: llama a
 * /api/cron/conciliar-arca, que no emite nada.
 *
 * Devuelve dos piezas porque van en lugares distintos de la pantalla: el
 * boton con su leyenda en el encabezado, y el detalle a lo ancho debajo.
 */

interface Fila { numero: number; fechaVenta?: string; monto: number; receptor?: string | null; dni?: string | null }

interface Resultado {
  mes: string
  ultimoNumero: number
  arca: { cantidad: number; total: number; desde: number | null; hasta: number | null }
  coinciden: number
  diferencias: (Fila & { problemas: string[] })[]
  soloArca: { numero: number; emision: string; monto: number; doc: string }[]
  soloApp: (Fila & { motivo: string })[]
  duplicados: { a: number; b: number; motivo: string }[]
  manuales: { fechaVenta: string; monto: number; receptor: string | null; posiblesEnArca: number[] }[]
}

const ddmm = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

export function useConciliacionArca(mes: string) {
  const [cargando, setCargando] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function conciliar() {
    setCargando(true)
    setError(null)
    setRes(null)
    try {
      const r = await fetch(`/api/cron/conciliar-arca?mes=${mes}`)
      const json = await r.json()
      if (!r.ok || json.error) setError(json.error || `Error HTTP ${r.status}`)
      else setRes(json)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  const problemas = res
    ? res.diferencias.length + res.soloArca.length + res.soloApp.length + res.duplicados.length
    : 0

  const boton = (
    <div className="flex flex-col items-start sm:items-center gap-0.5">
      <button
        type="button"
        onClick={conciliar}
        disabled={cargando}
        className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-60"
        title="Compara lo emitido en ARCA este mes con lo que tiene la app. No emite nada."
      >
        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />}
        {cargando ? 'Consultando ARCA…' : 'Conciliar con ARCA'}
      </button>
      {/* Leyenda: que hace, o el resultado de la ultima corrida */}
      <span className={`text-[10px] leading-tight ${
        !res ? 'text-muted-foreground' : problemas === 0 ? 'text-green-600' : 'text-amber-600'
      }`}>
        {!res
          ? 'Compara el mes con ARCA · no emite nada'
          : problemas === 0
            ? `✓ Coinciden las ${res.coinciden} del mes`
            : `⚠ ${problemas} diferencia${problemas === 1 ? '' : 's'} · ver detalle abajo`}
      </span>
    </div>
  )

  const panel = (error || res) ? (
    <div className="space-y-2">

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {res && (
        <div className="rounded-md border bg-card text-xs">
          <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium">
                {problemas === 0
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                {problemas === 0 ? 'ARCA y la app coinciden' : `${problemas} diferencia${problemas === 1 ? '' : 's'} con ARCA`}
              </div>
              <div className="text-muted-foreground">
                ARCA emitió {res.arca.cantidad} comprobante{res.arca.cantidad === 1 ? '' : 's'} en el mes
                {res.arca.desde != null && <> (nº {res.arca.desde}–{res.arca.hasta})</>} por {formatPrecio(res.arca.total)} ·{' '}
                {res.coinciden} coinciden con la app · último nº en ARCA: {res.ultimoNumero}
              </div>
            </div>
            <button onClick={() => setRes(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <Seccion titulo="Posibles duplicados" nota="Mismo monto a la misma persona, con pocos días de diferencia." items={res.duplicados}
            render={d => <>nº {d.a} y nº {d.b} — {d.motivo}</>} />

          <Seccion titulo="Emitidas fuera de la app" nota="Están en ARCA pero la app no las tiene (por ejemplo, hechas desde la web de ARCA)." items={res.soloArca}
            render={c => <>nº {c.numero} · emitida {ddmm(c.emision)} · {formatPrecio(c.monto)} · {c.doc === '0' ? 'Consumidor Final' : `DNI ${c.doc}`}</>} />

          <Seccion titulo="La app las da por emitidas y ARCA no" items={res.soloApp}
            render={f => <>nº {f.numero} · {f.receptor} · venta {ddmm(f.fechaVenta)} · {formatPrecio(f.monto)} — {f.motivo}</>} />

          <Seccion titulo="Número igual, datos distintos" items={res.diferencias}
            render={f => <>nº {f.numero} · {f.receptor} — {f.problemas.join(' · ')}</>} />

          <Seccion titulo="Marcadas como facturadas a mano (sin número)" nota="No se pueden verificar contra ARCA. Si hay un número sugerido, probablemente sea ese." items={res.manuales}
            render={m => <>{ddmm(m.fechaVenta)} · {m.receptor} · {formatPrecio(m.monto)}{m.posiblesEnArca.length > 0 && <> — ¿nº {m.posiblesEnArca.join(' o ')}?</>}</>} />
        </div>
      )}
    </div>
  ) : null

  return { boton, panel }
}

function Seccion<T>({ titulo, nota, items, render }: {
  titulo: string
  nota?: string
  items: T[]
  render: (item: T) => React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div className="border-b last:border-b-0 px-3 py-2 space-y-1">
      <div className="font-medium">{titulo} ({items.length})</div>
      {nota && <div className="text-[11px] text-muted-foreground">{nota}</div>}
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="tabular-nums break-words">{render(it)}</li>)}
      </ul>
    </div>
  )
}
