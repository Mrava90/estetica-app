/**
 * GET /auth/acceso?t=<token>
 *
 * Destino del boton "Ver mis turnos" del mail de confirmacion. Verifica el
 * token firmado (ver @/lib/acceso-turnos), pide a Supabase un magic link
 * nuevo para ese email y lo canjea en el acto: la clienta llega a
 * /reservar/mis-turnos con la sesion abierta.
 *
 * Si algo falla nunca manda al /login del personal: va a mis-turnos con
 * ?vencido=1, que le ofrece mandarle un enlace nuevo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarAcceso } from '@/lib/acceso-turnos'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const destino = new URL('/reservar/mis-turnos', request.url)
  const vencido = new URL('/reservar/mis-turnos?vencido=1', request.url)

  const email = verificarAcceso(request.nextUrl.searchParams.get('t'))
  if (!email) return NextResponse.redirect(vencido)

  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) {
      console.error('[auth/acceso] generateLink:', error?.message)
      return NextResponse.redirect(vencido)
    }
    const supabase = await createClient()
    const { error: otpErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    if (otpErr) {
      console.error('[auth/acceso] verifyOtp:', otpErr.message)
      return NextResponse.redirect(vencido)
    }
    return NextResponse.redirect(destino)
  } catch (e) {
    console.error('[auth/acceso]', e)
    return NextResponse.redirect(vencido)
  }
}
