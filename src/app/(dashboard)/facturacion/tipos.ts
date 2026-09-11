/**
 * Tipos compartidos del modulo de facturacion.
 *
 * Viven aparte de page.tsx para que los componentes de la pantalla
 * (BadgeCanal, FilaFactura) no tengan que importar la pagina entera.
 */

export type EstadoFactura = 'pendiente' | 'excluida' | 'emitida' | 'error'
export type RowMode = 'idle' | 'confirming' | 'loading'
export type TipoPagoMP = 'QR' | 'Point' | 'Transferencia' | 'Link' | 'Dinero en cuenta' | 'Otro'
export type MedioPago = 'MercadoPago' | 'Efectivo' | 'Otro'

export interface ItemFacturacion {
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
export const CANALES_PRESENCIALES: TipoPagoMP[] = ['QR', 'Point']

/** Datos editables a mano antes de mandar la fila a ARCA. */
export interface EdicionFila {
  nombre: string
  dni: string
  descripcion: string
}
