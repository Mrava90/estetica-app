/**
 * /facturacion/comprobante/[id]
 *
 * Vista previa del comprobante electrónico. Abre en nueva pestaña.
 * El usuario imprime (Ctrl+P) o guarda como PDF desde el navegador.
 */

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import PrintButton from './PrintButton'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function formatCUIT(cuit: string) {
  const c = cuit.replace(/\D/g, '')
  if (c.length === 11) return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`
  return cuit
}

function formatDNI(dni: string) {
  const n = dni.replace(/\D/g, '')
  if (n.length === 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`
  if (n.length === 7) return `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`
  return dni
}

function isoToAR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatPrecio(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}

function padPV(n: number | null) {
  return String(n ?? 3).padStart(4, '0')
}
function padNro(n: number | null) {
  return String(n ?? 0).padStart(8, '0')
}

const TIPO_CBTE: Record<number, string> = { 1: 'A', 6: 'B', 11: 'C' }

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = getSupabase()

  const { data: f } = await sb
    .from('facturas')
    .select('*')
    .eq('id', id)
    .single()

  if (!f || f.estado !== 'emitida' || !f.cae) notFound()

  const cuit      = process.env.AFIP_CUIT ?? ''
  const razonSocial = process.env.AFIP_RAZON_SOCIAL ?? 'Estética'
  const tipoLetra = TIPO_CBTE[f.tipo_cbte] ?? 'C'
  const nroFactura = `${padPV(f.punto_venta)}-${padNro(f.numero_cbte)}`
  const fechaEmision = f.created_at ? isoToAR(f.created_at.slice(0, 10)) : isoToAR(f.fecha)
  const fechaServicio = isoToAR(f.fecha)
  const caeFmt = f.cae.replace(/(\d{8})(\d{6})/, '$1-$2')

  return (
    <>
      {/* Print button — se oculta al imprimir */}
      <div className="no-print flex items-center justify-between px-8 py-4 bg-gray-100 border-b">
        <span className="text-sm text-gray-600">Vista previa del comprobante</span>
        <PrintButton />
      </div>

      {/* Hoja A4 */}
      <div className="invoice-page">

        {/* Cabecera: izquierda, tipo, derecha */}
        <div className="invoice-header">

          {/* Datos del emisor */}
          <div className="header-left">
            <p className="issuer-name">{razonSocial}</p>
            <p>CUIT: {formatCUIT(cuit)}</p>
            <p>Condición IVA: Responsable Monotributo</p>
          </div>

          {/* Letra del comprobante */}
          <div className="header-type">
            <div className="type-box">{tipoLetra}</div>
            <div className="type-label">FACTURA</div>
            <div className="type-label-small">Código 11</div>
          </div>

          {/* Número y fecha */}
          <div className="header-right">
            <p className="invoice-number">N° {nroFactura}</p>
            <table className="header-table">
              <tbody>
                <tr><td>Fecha de emisión:</td><td><strong>{fechaEmision}</strong></td></tr>
                <tr><td>Fecha del servicio:</td><td>{fechaServicio}</td></tr>
                <tr><td>Punto de venta:</td><td>{padPV(f.punto_venta)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Destinatario */}
        <div className="section">
          <div className="section-title">Datos del receptor</div>
          <div className="section-grid">
            <div>
              <span className="label">Apellido y nombre / Razón social:</span>
              <span className="value">{f.receptor_nombre}</span>
            </div>
            <div>
              <span className="label">DNI / CUIT:</span>
              <span className="value">{f.receptor_dni ? formatDNI(f.receptor_dni) : '—'}</span>
            </div>
            <div>
              <span className="label">Condición frente al IVA:</span>
              <span className="value">Consumidor Final</span>
            </div>
          </div>
        </div>

        {/* Detalle */}
        <div className="section">
          <div className="section-title">Detalle</div>
          <table className="items-table">
            <thead>
              <tr>
                <th className="text-left">Descripción</th>
                <th className="text-center">Cantidad</th>
                <th className="text-right">Precio unitario</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{f.descripcion || 'Servicio de estética'}</td>
                <td className="text-center">1</td>
                <td className="text-right">{formatPrecio(f.monto)}</td>
                <td className="text-right">{formatPrecio(f.monto)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="totals">
          <table>
            <tbody>
              <tr><td>Subtotal:</td><td>{formatPrecio(f.monto)}</td></tr>
              <tr><td>IVA (Monotributo — incluido):</td><td>—</td></tr>
              <tr className="total-row"><td>IMPORTE TOTAL:</td><td>{formatPrecio(f.monto)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* CAE */}
        <div className="cae-section">
          <div className="cae-row">
            <span className="label">CAE N°:</span>
            <span className="cae-number">{caeFmt}</span>
          </div>
          <div className="cae-row">
            <span className="label">Fecha de vencimiento del CAE:</span>
            <span>{f.cae_vencimiento ? isoToAR(f.cae_vencimiento) : '—'}</span>
          </div>
          <p className="afip-note">Comprobante autorizado por AFIP · www.afip.gob.ar</p>
        </div>

      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }

        body { font-family: Arial, Helvetica, sans-serif; background: #f5f5f5; }

        .invoice-page {
          width: 210mm;
          min-height: 297mm;
          margin: 20px auto;
          background: white;
          padding: 16mm 18mm;
          box-shadow: 0 2px 12px rgba(0,0,0,.15);
          font-size: 11pt;
          color: #111;
        }

        /* Cabecera */
        .invoice-header {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          border: 2px solid #111;
          padding: 12px;
          margin-bottom: 16px;
        }
        .header-left { font-size: 10pt; }
        .issuer-name { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }

        .header-type {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-left: 2px solid #111;
          border-right: 2px solid #111;
          padding: 0 20px;
        }
        .type-box {
          width: 52px; height: 52px;
          border: 3px solid #111;
          display: flex; align-items: center; justify-content: center;
          font-size: 32pt; font-weight: bold;
          margin-bottom: 4px;
        }
        .type-label { font-size: 10pt; font-weight: bold; text-align: center; }
        .type-label-small { font-size: 8pt; color: #555; }

        .header-right { text-align: right; font-size: 10pt; }
        .invoice-number { font-size: 14pt; font-weight: bold; margin-bottom: 6px; }
        .header-table td { padding: 1px 4px; }
        .header-table td:first-child { color: #555; text-align: right; }
        .header-table td:last-child { text-align: right; }

        /* Secciones */
        .section { border: 1px solid #ccc; margin-bottom: 12px; }
        .section-title {
          background: #f0f0f0;
          font-weight: bold;
          font-size: 9pt;
          padding: 4px 10px;
          border-bottom: 1px solid #ccc;
          text-transform: uppercase;
          letter-spacing: .05em;
        }
        .section-grid { padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 8px 32px; }
        .section-grid > div { display: flex; gap: 6px; font-size: 10pt; }
        .label { color: #555; }
        .value { font-weight: 600; }

        /* Tabla de ítems */
        .items-table { width: 100%; border-collapse: collapse; }
        .items-table th { background: #f0f0f0; padding: 5px 10px; font-size: 9pt; border-bottom: 2px solid #ccc; }
        .items-table td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 10pt; }

        /* Totales */
        .totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .totals table { border: 1px solid #ccc; }
        .totals td { padding: 5px 16px; font-size: 10pt; }
        .totals td:first-child { color: #555; border-right: 1px solid #ccc; }
        .totals td:last-child { text-align: right; min-width: 120px; font-weight: 600; }
        .total-row td { background: #f0f0f0; font-weight: bold; font-size: 12pt; border-top: 2px solid #ccc; }

        /* CAE */
        .cae-section {
          border: 2px solid #111;
          padding: 10px 14px;
          background: #fafafa;
        }
        .cae-row { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 10pt; }
        .cae-number { font-family: monospace; font-size: 13pt; font-weight: bold; letter-spacing: .05em; }
        .afip-note { margin-top: 8px; font-size: 8pt; color: #666; text-align: center; }
      `}</style>
    </>
  )
}
