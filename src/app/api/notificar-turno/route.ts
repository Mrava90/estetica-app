import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'
import { formatFechaHoraAR } from '@/lib/timezone'
import { check as rateLimit, getClientIp } from '@/lib/rate-limit'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Escapa caracteres HTML para evitar inyeccion en el cuerpo del mail */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  // Rate limit: max 5 emails/hora por IP para evitar abuso masivo del SMTP
  const ip = getClientIp(request)
  const rl = rateLimit(ip, { name: 'notificar-turno', windowMs: 60 * 60_000, max: 5, blockMs: 60 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas notificaciones' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec ?? 3600) },
    })
  }

  // Body solo lleva citaId. Email y nombre se obtienen server-side desde la DB
  // (no aceptamos email arbitrario del body para evitar abuso del SMTP).
  const { citaId } = await request.json().catch(() => ({}))

  if (!citaId || typeof citaId !== 'string' || !UUID_RE.test(citaId)) {
    return NextResponse.json({ error: 'citaId invalido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Obtener datos del turno + cliente (email y nombre autoritativos)
  const { data: cita } = await admin
    .from('citas')
    .select('id, fecha_inicio, created_at, servicios(nombre), profesionales(nombre), clientes(nombre, email)')
    .eq('id', citaId)
    .single()

  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  // Solo permitir notificar citas creadas en los ultimos 30 minutos (rate limit natural)
  const createdAt = new Date(cita.created_at).getTime()
  if (Date.now() - createdAt > 30 * 60 * 1000) {
    return NextResponse.json({ error: 'Cita expirada para notificacion' }, { status: 403 })
  }

  const cliente = Array.isArray(cita.clientes) ? cita.clientes[0] : cita.clientes as any
  const emailDestino = cliente?.email
  if (!emailDestino) {
    // El cliente no dejo email — nada que enviar. Silencioso: no revela si la cita existe.
    return NextResponse.json({ ok: true, sent: false })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://turnosballester.vercel.app'
  const link = `${appUrl}/reservar/mis-turnos`

  const servicio = escapeHtml((cita.servicios as any)?.nombre || '')
  const profesional = escapeHtml((cita.profesionales as any)?.nombre || '')
  const fechaFormateada = escapeHtml(formatFechaHoraAR(cita.fecha_inicio))
  const nombreCliente = escapeHtml(cliente?.nombre || 'cliente')

  try {
    await transporter.sendMail({
      from: `Kawirth <${process.env.GMAIL_USER}>`,
      to: emailDestino,
      subject: `Tu turno en Kawirth está confirmado ✓`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#a21caf;margin-bottom:8px;">¡Hola, ${nombreCliente}!</h2>
          <p style="color:#374151;">Tu turno en <strong>Kawirth</strong> está confirmado.</p>

          <div style="background:#f9f0ff;border-radius:12px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 8px;color:#374151;"><strong>📅 Fecha:</strong> ${fechaFormateada}</p>
            ${servicio ? `<p style="margin:0 0 8px;color:#374151;"><strong>💅 Servicio:</strong> ${servicio}</p>` : ''}
            ${profesional ? `<p style="margin:0;color:#374151;"><strong>👤 Profesional:</strong> ${profesional}</p>` : ''}
          </div>

          <a href="${link}"
             style="display:inline-block;margin:8px 0 16px;padding:12px 28px;background:#a21caf;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
            Ver mis turnos
          </a>

          <p style="color:#9ca3af;font-size:13px;">Desde ese link también podés cancelar tu turno.<br>El acceso es válido por 7 días.</p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true, sent: true })
  } catch (err: any) {
    console.error('Error enviando email:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
