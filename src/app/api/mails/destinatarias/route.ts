/**
 * Clientas a las que les llegaria un mail, segun el segmento elegido en
 * Servicios > Mails. Solo admin. No manda nada: es la vista previa.
 *
 * POST { plantilla_id?, segmento: { tipo: 'todas' | 'inactivas' | 'servicio' | 'clienta',
 *        dias?, servicio_id?, cliente_ids? },
 *        excluir?: { recientes_dias?, con_turno? } }
 * → { destinatarias: [{ id, nombre, apellido, email }], omitidas: { baja, repetidas, recientes, con_turno } }
 *
 * excluir.recientes_dias: no mandar a quien vino hace menos de N dias.
 * excluir.con_turno: no mandar a quien ya tiene un turno reservado a futuro.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'
import { DIAS_SIN_REPETIR } from '@/lib/mails'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Admin = ReturnType<typeof createAdminClient>

/** Supabase devuelve hasta 1000 filas por pedido: se pagina. */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < 1000) return filas
  }
}

/**
 * Por clienta: ultima visita (turno no cancelado, ya pasado), servicios que se
 * hizo y si tiene un turno reservado a futuro.
 */
async function historial(admin: Admin) {
  const ahora = new Date().toISOString()
  const citas = await todas<{ cliente_id: string | null; servicio_id: string | null; fecha_inicio: string }>((d, h) =>
    admin.from('citas').select('cliente_id, servicio_id, fecha_inicio')
      .neq('status', 'cancelada').not('cliente_id', 'is', null).range(d, h))
  const ultima = new Map<string, string>()
  const servicios = new Map<string, Set<string>>()
  const conTurno = new Set<string>()
  for (const c of citas) {
    if (!c.cliente_id) continue
    if (c.fecha_inicio > ahora) { conTurno.add(c.cliente_id); continue }
    if (!ultima.has(c.cliente_id) || ultima.get(c.cliente_id)! < c.fecha_inicio) ultima.set(c.cliente_id, c.fecha_inicio)
    if (c.servicio_id) {
      if (!servicios.has(c.cliente_id)) servicios.set(c.cliente_id, new Set())
      servicios.get(c.cliente_id)!.add(c.servicio_id)
    }
  }
  return { ultima, servicios, conTurno }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { plantilla_id, segmento, excluir } = await request.json().catch(() => ({}))
  const tipo = segmento?.tipo
  if (!['todas', 'inactivas', 'servicio', 'clienta'].includes(tipo)) return NextResponse.json({ error: 'Segmento invalido' }, { status: 400 })

  const admin = createAdminClient()
  try {
    let clientas = await todas<{ id: string; nombre: string; apellido: string | null; email: string | null; mail_baja_at: string | null }>((d, h) => {
      let q = admin.from('clientes').select('id, nombre, apellido, email, mail_baja_at').not('email', 'is', null)
      if (tipo === 'clienta') {
        const ids = (Array.isArray(segmento.cliente_ids) ? segmento.cliente_ids : []).filter((x: unknown) => typeof x === 'string').slice(0, 500)
        q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      }
      return q.order('nombre').range(d, h)
    })
    clientas = clientas.filter(c => EMAIL_RE.test((c.email || '').trim()))

    const recientesDias = Math.max(0, Number(excluir?.recientes_dias) || 0)
    let recientes = 0, conTurnoN = 0
    if (tipo === 'inactivas' || tipo === 'servicio' || recientesDias > 0 || excluir?.con_turno) {
      const { ultima, servicios, conTurno } = await historial(admin)
      // Primero el segmento, despues las exclusiones (asi los conteos son del segmento)
      if (tipo === 'inactivas') {
        const dias = Math.max(1, Number(segmento.dias) || 60)
        const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
        clientas = clientas.filter(c => ultima.has(c.id) && ultima.get(c.id)! < corte)
      } else if (tipo === 'servicio') {
        clientas = clientas.filter(c => servicios.get(c.id)?.has(segmento.servicio_id))
      }
      if (recientesDias > 0) {
        const corte = new Date(Date.now() - recientesDias * 86_400_000).toISOString()
        const antes = clientas.length
        clientas = clientas.filter(c => !(ultima.has(c.id) && ultima.get(c.id)! >= corte))
        recientes = antes - clientas.length
      }
      if (excluir?.con_turno) {
        const antes = clientas.length
        clientas = clientas.filter(c => !conTurno.has(c.id))
        conTurnoN = antes - clientas.length
      }
    }

    const baja = clientas.filter(c => c.mail_baja_at).length
    clientas = clientas.filter(c => !c.mail_baja_at)

    let repetidas = 0
    if (plantilla_id) {
      const desde = new Date(Date.now() - DIAS_SIN_REPETIR * 86_400_000).toISOString()
      const envios = await todas<{ cliente_id: string | null }>((d, h) =>
        admin.from('mail_envios').select('cliente_id').eq('plantilla_id', plantilla_id).eq('ok', true).gte('created_at', desde).range(d, h))
      const ya = new Set(envios.map(e => e.cliente_id))
      repetidas = clientas.filter(c => ya.has(c.id)).length
      clientas = clientas.filter(c => !ya.has(c.id))
    }

    return NextResponse.json({
      destinatarias: clientas.map(c => ({ id: c.id, nombre: c.nombre, apellido: c.apellido, email: c.email!.trim() })),
      omitidas: { baja, repetidas, recientes, con_turno: conTurnoN },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
