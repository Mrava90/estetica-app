/**
 * Manda una plantilla a un lote de clientas (Servicios > Mails). Solo admin.
 * La pantalla llama de a LOTE clientas para no pasar el tiempo de Vercel.
 *
 * POST { plantilla_id, cliente_ids: string[] }
 * → { enviados, omitidos: [{ id, motivo }], errores: [{ id, error }], topeAlcanzado }
 *
 * Todo se revalida aca aunque la vista previa ya lo haya filtrado: email
 * valido, sin baja, sin la misma plantilla en DIAS_SIN_REPETIR y el tope diario.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'
import { DIAS_SIN_REPETIR, LOTE, TOPE_DIARIO, armarMail, firmarBaja, transporter } from '@/lib/mails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { plantilla_id, cliente_ids } = await request.json().catch(() => ({}))
  if (!plantilla_id || !Array.isArray(cliente_ids) || cliente_ids.length === 0) return NextResponse.json({ error: 'Faltan la plantilla o las clientas' }, { status: 400 })
  if (cliente_ids.length > LOTE) return NextResponse.json({ error: `Máximo ${LOTE} por lote` }, { status: 400 })

  const admin = createAdminClient()
  const { data: plantilla } = await admin.from('mail_plantillas').select('id, asunto, cuerpo, promociones(imagen_url)').eq('id', plantilla_id).single()
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  const hace24 = new Date(Date.now() - 86_400_000).toISOString()
  const { count: hoy } = await admin.from('mail_envios').select('id', { count: 'exact', head: true }).eq('ok', true).gte('created_at', hace24)
  let restantes = TOPE_DIARIO - (hoy || 0)

  const desde = new Date(Date.now() - DIAS_SIN_REPETIR * 86_400_000).toISOString()
  const [{ data: clientas }, { data: previos }] = await Promise.all([
    admin.from('clientes').select('id, nombre, apellido, email, mail_baja_at').in('id', cliente_ids),
    admin.from('mail_envios').select('cliente_id').eq('plantilla_id', plantilla_id).eq('ok', true).gte('created_at', desde).in('cliente_id', cliente_ids),
  ])
  const ya = new Set((previos || []).map(p => p.cliente_id))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://turnosballester.vercel.app'

  let enviados = 0
  const omitidos: { id: string; motivo: string }[] = []
  const errores: { id: string; error: string }[] = []
  for (const id of cliente_ids as string[]) {
    const c = (clientas || []).find(x => x.id === id)
    const email = (c?.email || '').trim()
    if (!c || !EMAIL_RE.test(email)) { omitidos.push({ id, motivo: 'sin email válido' }); continue }
    if (c.mail_baja_at) { omitidos.push({ id, motivo: 'se dio de baja' }); continue }
    if (ya.has(id)) { omitidos.push({ id, motivo: `ya la recibió en los últimos ${DIAS_SIN_REPETIR} días` }); continue }
    if (restantes <= 0) { omitidos.push({ id, motivo: 'tope diario' }); continue }

    const urlBaja = `${appUrl}/api/mails/baja?t=${encodeURIComponent(firmarBaja(id))}`
    const imagenUrl = (plantilla.promociones as unknown as { imagen_url: string | null } | null)?.imagen_url
    const m = armarMail(plantilla.asunto, plantilla.cuerpo, c, urlBaja, { imagenUrl, urlReservar: `${appUrl}/reservar` })
    try {
      await transporter.sendMail({
        from: `Ka Wirth Villa Ballester <${process.env.GMAIL_USER}>`,
        to: email,
        subject: m.asunto,
        html: m.html,
        text: m.text,
        headers: { 'List-Unsubscribe': `<${urlBaja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      })
      enviados++; restantes--
      await admin.from('mail_envios').insert({ plantilla_id, asunto: m.asunto, cliente_id: id, email, ok: true, enviado_por: user.id })
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300)
      errores.push({ id, error: msg })
      await admin.from('mail_envios').insert({ plantilla_id, asunto: m.asunto, cliente_id: id, email, ok: false, error: msg, enviado_por: user.id })
    }
  }
  return NextResponse.json({ enviados, omitidos, errores, topeAlcanzado: restantes <= 0 })
}
