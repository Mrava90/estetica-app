import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
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

function padPV(n: number | null) { return String(n ?? 3).padStart(4, '0') }
function padNro(n: number | null) { return String(n ?? 0).padStart(8, '0') }

const TIPO_CBTE: Record<number, string> = { 1: 'A', 6: 'B', 11: 'C' }

export async function POST(request: NextRequest) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { factura_id, email } = await request.json()
  if (!factura_id || !email) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const sb = getSupabase()
  const { data: f } = await sb
    .from('facturas')
    .select('*')
    .eq('id', factura_id)
    .single()

  if (!f || f.estado !== 'emitida' || !f.cae) {
    return NextResponse.json({ error: 'Factura no encontrada o no emitida' }, { status: 404 })
  }

  const cuit       = (process.env.AFIP_CUIT ?? '').trim()
  const razonSocial = (process.env.AFIP_RAZON_SOCIAL ?? 'Estética').trim()
  const appUrl     = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://turnosballester.vercel.app').trim()
  const from       = process.env.RESEND_FROM || 'Facturación <noreply@kawirth.com>'

  const tipoLetra  = TIPO_CBTE[f.tipo_cbte] ?? 'C'
  const nroFactura = `${padPV(f.punto_venta)}-${padNro(f.numero_cbte)}`
  const fechaEmision = f.created_at ? isoToAR(f.created_at.slice(0, 10)) : isoToAR(f.fecha)
  const caeFmt     = f.cae.replace(/(\d{8})(\d{6})/, '$1-$2')
  const link       = `${appUrl}/facturacion/comprobante/${factura_id}`
  const caeFchText = f.cae_vencimiento ? isoToAR(f.cae_vencimiento) : '—'

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

    <!-- Header -->
    <div style="background:#166534;padding:20px 28px;">
      <p style="margin:0;color:#fff;font-size:12pt;font-weight:bold;">${razonSocial}</p>
      <p style="margin:4px 0 0;color:#bbf7d0;font-size:10pt;">CUIT: ${formatCUIT(cuit)} · Responsable Monotributo</p>
    </div>

    <!-- Tipo + Número -->
    <div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="display:inline-block;border:3px solid #111;width:44px;height:44px;text-align:center;line-height:44px;font-size:26pt;font-weight:bold;margin-right:12px;vertical-align:middle;">${tipoLetra}</div>
        <span style="font-size:14pt;font-weight:bold;vertical-align:middle;">FACTURA</span>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:14pt;font-weight:bold;">N° ${nroFactura}</p>
        <p style="margin:2px 0 0;font-size:10pt;color:#6b7280;">Emisión: ${fechaEmision}</p>
      </div>
    </div>

    <!-- Receptor -->
    <div style="padding:16px 28px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
      <p style="margin:0 0 6px;font-size:9pt;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Datos del receptor</p>
      <p style="margin:0;font-size:11pt;font-weight:600;">${f.receptor_nombre || '—'}</p>
      ${f.receptor_dni
        ? `<p style="margin:2px 0 0;font-size:10pt;color:#374151;">DNI: ${formatDNI(f.receptor_dni)}</p>`
        : ''}
      <p style="margin:2px 0 0;font-size:10pt;color:#374151;">Condición IVA: Consumidor Final</p>
    </div>

    <!-- Detalle -->
    <div style="padding:16px 28px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;font-size:9pt;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Detalle</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:6px 10px;font-size:9pt;border-bottom:2px solid #d1d5db;">Descripción</th>
            <th style="text-align:right;padding:6px 10px;font-size:9pt;border-bottom:2px solid #d1d5db;">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 10px;font-size:10pt;">${f.descripcion || 'Servicio de estética'}</td>
            <td style="padding:8px 10px;font-size:10pt;text-align:right;font-weight:600;">${formatPrecio(f.monto)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Total -->
    <div style="padding:12px 28px;border-bottom:1px solid #e5e7eb;text-align:right;">
      <span style="font-size:11pt;color:#6b7280;margin-right:16px;">IMPORTE TOTAL:</span>
      <span style="font-size:14pt;font-weight:bold;">${formatPrecio(f.monto)}</span>
    </div>

    <!-- CAE -->
    <div style="padding:16px 28px;border-bottom:1px solid #e5e7eb;background:#f0fdf4;border-left:4px solid #166534;">
      <p style="margin:0 0 4px;font-size:10pt;color:#374151;">
        <strong>CAE N°:</strong>
        <span style="font-family:monospace;font-size:12pt;font-weight:bold;letter-spacing:.05em;margin-left:8px;">${caeFmt}</span>
      </p>
      <p style="margin:0;font-size:10pt;color:#374151;">
        <strong>Vencimiento CAE:</strong> ${caeFchText}
      </p>
      <p style="margin:6px 0 0;font-size:8pt;color:#6b7280;">Comprobante autorizado por AFIP · www.afip.gob.ar</p>
    </div>

    <!-- CTA -->
    <div style="padding:20px 28px;text-align:center;">
      <a href="${link}"
         style="display:inline-block;padding:12px 28px;background:#166534;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:11pt;">
        Ver comprobante oficial
      </a>
      <p style="margin:12px 0 0;font-size:9pt;color:#9ca3af;">O copiá este link: ${link}</p>
    </div>

  </div>
</body>
</html>`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: resendError } = await resend.emails.send({
    from,
    to: email.trim(),
    subject: `Factura ${tipoLetra} N° ${nroFactura} — ${razonSocial}`,
    html,
  })

  if (resendError) {
    console.error('Resend error:', resendError)
    return NextResponse.json({ error: resendError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
