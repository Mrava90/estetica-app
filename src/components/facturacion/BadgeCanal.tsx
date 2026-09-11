'use client'

import type { ItemFacturacion, MedioPago, TipoPagoMP } from '@/app/(dashboard)/facturacion/tipos'

interface Props {
  tipo: TipoPagoMP | null
  match: ItemFacturacion['mp_match']
  medio?: MedioPago
}

const ESTILOS: Record<TipoPagoMP, string> = {
  'QR':               'bg-violet-100 text-violet-700 border-violet-200',
  'Point':            'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Transferencia':    'bg-slate-100 text-slate-600 border-slate-200',
  'Link':             'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Dinero en cuenta': 'bg-slate-100 text-slate-600 border-slate-200',
  'Otro':             'bg-gray-100 text-gray-600 border-gray-200',
}

const ICONOS: Record<TipoPagoMP, string> = {
  'QR': '▣', 'Point': '▤', 'Transferencia': '⇄', 'Link': '🔗', 'Dinero en cuenta': '●', 'Otro': '·',
}

/**
 * Badge del canal de cobro.
 * Para MercadoPago muestra el canal fino (QR / Point / Transferencia).
 * Para efectivo muestra un badge propio, porque no tiene canal de MP.
 */
export function BadgeCanal({ tipo, match, medio }: Props) {
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
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0 text-[9px] font-medium whitespace-nowrap leading-[1.4] ${ESTILOS[tipo]}`}
      title={match === 'ambiguo' ? 'Varios pagos coinciden en fecha y monto — verificá' : `Cobrado por ${tipo}`}
    >
      <span aria-hidden>{ICONOS[tipo]}</span>
      {tipo}
      {match === 'ambiguo' && <span className="text-amber-600 font-bold" title="Coincidencia ambigua">?</span>}
    </span>
  )
}
