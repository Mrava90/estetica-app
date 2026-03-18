import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nombre')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Responder ok aunque no exista (no revelar si el email está registrado)
  if (!cliente) return NextResponse.json({ ok: true })

  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await admin
    .from('clientes')
    .update({ access_token: token, access_token_expires_at: expiresAt })
    .eq('id', cliente.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://estetica-app.vercel.app'
  const link = `${appUrl}/reservar/mis-turnos?token=${token}`
  const from = process.env.RESEND_FROM || 'Kawirth <noreply@kawirth.com>'

  await resend.emails.send({
    from,
    to: email,
    subject: 'Kawirth - Acceso a tus turnos',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#a21caf;margin-bottom:8px;">¡Hola, ${cliente.nombre}!</h2>
        <p style="color:#374151;">Tu reserva en <strong>Kawirth</strong> está confirmada.</p>
        <p style="color:#374151;">Si querés ver o cancelar tu turno, hacé clic acá:</p>
        <a href="${link}"
           style="display:inline-block;margin:16px 0;padding:12px 28px;background:#a21caf;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          Ver mis turnos
        </a>
        <p style="color:#9ca3af;font-size:13px;">El link es válido por 7 días.</p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
