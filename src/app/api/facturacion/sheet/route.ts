/**
 * GET /api/facturacion/sheet?mes=YYYY-MM
 *
 * Devuelve las filas facturables del mes: hojas "Afip SSR" y "Afip KW" del
 * Google Sheet, cruzadas con la tabla `facturas` y con los pagos de
 * MercadoPago (para saber si el cobro entro por QR, Point o transferencia).
 *
 * La logica vive en @/lib/facturacion-sheet porque tambien la usa el cron
 * de facturacion automatica, que no puede llamar a este endpoint (el
 * middleware lo redirige a /login).
 */

import { NextResponse } from 'next/server'
import { obtenerFilasFacturacion } from '@/lib/facturacion-sheet'

// Lee env vars en runtime (MP_ACCESS_TOKEN, credenciales de Google), asi que
// no puede cachearse.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const mesParam = searchParams.get('mes')
    || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  if (!/^\d{4}-\d{2}$/.test(mesParam)) {
    return NextResponse.json({ items: [], total: 0, error: 'Formato de mes invalido' }, { status: 400 })
  }

  try {
    const { items, mpDisponible } = await obtenerFilasFacturacion(mesParam)
    return NextResponse.json({
      items,
      total: items.length,
      mp_disponible: mpDisponible,
    })
  } catch (err) {
    console.error('facturacion/sheet error:', err)
    return NextResponse.json({ items: [], total: 0, error: String(err) }, { status: 500 })
  }
}
