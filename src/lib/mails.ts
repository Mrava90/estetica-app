/**
 * Mails a clientas desde Servicios > Mails (ver migracion 00049).
 *
 * Salen por el mismo Gmail que las notificaciones de turno (GMAIL_USER),
 * uno por clienta, nunca en copia. Cada mail lleva un enlace de baja firmado
 * (HMAC derivado de SUPABASE_SERVICE_ROLE_KEY, igual que acceso-turnos) y los
 * encabezados List-Unsubscribe, que Gmail usa para no mandarlo a spam.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import nodemailer from 'nodemailer'

/** Tope diario: Gmail corta en ~500 destinatarios por dia en cuentas comunes. */
export const TOPE_DIARIO = 450
/** La misma plantilla no se repite a la misma clienta dentro de estos dias. */
export const DIAS_SIN_REPETIR = 7
/** Clientas por llamada a /api/mails/enviar (para no pasar el tiempo de Vercel). */
export const LOTE = 15

export const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
})

function clave(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createHmac('sha256', base).update('kawirth:baja-mails:v1').digest()
}

/** Token de baja para una clienta. No vence: una baja tiene que andar siempre. */
export function firmarBaja(clienteId: string): string {
  return `${clienteId}.${createHmac('sha256', clave()).update(clienteId).digest('base64url')}`
}

/** Devuelve el id de la clienta si el token es valido; si no, null. */
export function verificarBaja(token: string | null | undefined): string | null {
  if (!token) return null
  const [id, firma] = token.split('.')
  if (!id || !firma) return null
  const esperada = Buffer.from(createHmac('sha256', clave()).update(id).digest('base64url'))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  return id
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface Clienta { nombre: string; apellido: string | null }

/** Reemplaza {nombre} y {apellido}. Sirve para asunto y cuerpo. */
export function completar(texto: string, c: Clienta): string {
  const nombre = (c.nombre || '').trim().split(/\s+/)[0] || ''
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
  return texto
    .replace(/\{nombre\}/gi, cap(nombre))
    .replace(/\{apellido\}/gi, cap((c.apellido || '').trim()))
}

/**
 * Arma el mail: el cuerpo es texto plano, cada parrafo va en un <p>.
 * Con `imagenUrl` (cartel de una promocion) la imagen va arriba y al final
 * un boton para reservar.
 */
export function armarMail(asunto: string, cuerpo: string, c: Clienta, urlBaja: string,
  extra: { imagenUrl?: string | null; urlReservar?: string } = {}) {
  const texto = completar(cuerpo, c)
  const parrafos = texto.split(/\n{2,}/).map(p =>
    `<p style="color:#374151;line-height:1.5;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
  const imagen = extra.imagenUrl && /^https:\/\//.test(extra.imagenUrl)
    ? `<img src="${escapeHtml(extra.imagenUrl)}" alt="" style="display:block;width:100%;max-width:520px;border-radius:12px;margin:0 0 18px;">` : ''
  const boton = imagen && extra.urlReservar
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(extra.urlReservar)}" style="display:inline-block;padding:12px 28px;background:#a21caf;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Reservar turno</a></p>` : ''
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#a21caf;margin:0 0 16px;">Ka Wirth Villa Ballester</h2>
      ${imagen}
      ${boton ? boton.replace('margin:20px 0;', 'margin:0 0 22px;text-align:center;') : ''}
      ${parrafos}
      <p style="color:#9ca3af;font-size:12px;margin-top:28px;border-top:1px solid #f3e8ff;padding-top:12px;">
        Recibís este mail porque sos clienta de Ka Wirth Villa Ballester.
        <a href="${urlBaja}" style="color:#9ca3af;">No quiero recibir más mails</a>
      </p>
    </div>`
  const text = `${texto}${boton ? `\n\nReservá tu turno: ${extra.urlReservar}` : ''}\n\n—\nPara no recibir más mails: ${urlBaja}`
  return { asunto: completar(asunto, c), html, text }
}
