/**
 * Baja de los mails de Clientes > Mails. Publica (va en el pie de cada mail),
 * se valida con el token firmado de firmarBaja.
 *
 * GET  ?t=  → la clienta hizo clic en "No quiero recibir más mails"
 * POST ?t=  → baja de un clic que dispara Gmail (List-Unsubscribe-Post)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarBaja } from '@/lib/mails'

export const dynamic = 'force-dynamic'

async function darDeBaja(request: NextRequest) {
  const id = verificarBaja(request.nextUrl.searchParams.get('t'))
  if (!id) return false
  const { error } = await createAdminClient().from('clientes')
    .update({ mail_baja_at: new Date().toISOString() }).eq('id', id).is('mail_baja_at', null)
  return !error
}

function pagina(ok: boolean) {
  const msg = ok
    ? 'Listo, no vas a recibir más mails de promociones de Ka Wirth Villa Ballester.'
    : 'El enlace no es válido. Escribinos por WhatsApp y te damos de baja.'
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja de mails</title></head>
    <body style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#374151;">
    <h2 style="color:#a21caf;">Ka Wirth Villa Ballester</h2><p>${msg}</p></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(request: NextRequest) {
  return pagina(await darDeBaja(request))
}

export async function POST(request: NextRequest) {
  const ok = await darDeBaja(request)
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
}
