/**
 * Historial de Servicios > Mails: ultimos envios agrupados por asunto y dia. Solo admin.
 *
 * Alcance: por cada grupo, cuantas de las clientas que recibieron el mail sacaron
 * turno (cita creada) en los DIAS_ALCANCE dias siguientes a su envio, separando
 * web (origen 'online') de las cargadas en el local. Turnos cancelados no cuentan.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const DIAS_ALCANCE = 7
const DIA_MS = 86_400_000

interface Grupo {
  dia: string; plantilla: string; enviados: number; fallidos: number
  reservaron: number; web: number; local: number; dias_medidos: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const admin = createAdminClient()
  const [{ data, error }, { count: bajas }] = await Promise.all([
    admin.from('mail_envios').select('plantilla_id, asunto, ok, cliente_id, created_at, mail_plantillas(nombre)')
      .order('created_at', { ascending: false }).limit(3000),
    admin.from('clientes').select('id', { count: 'exact', head: true }).not('mail_baja_at', 'is', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const grupos = new Map<string, Grupo>()
  // Por grupo: clienta -> momento en que le llego el mail
  const recibidas = new Map<string, Map<string, number>>()
  for (const e of data || []) {
    const p = (e.mail_plantillas as unknown as { nombre: string } | null)?.nombre || '(plantilla borrada)'
    const k = `${dia(e.created_at)}|${e.plantilla_id}`
    if (!grupos.has(k)) {
      if (grupos.size >= 30) continue
      grupos.set(k, { dia: dia(e.created_at), plantilla: p, enviados: 0, fallidos: 0, reservaron: 0, web: 0, local: 0, dias_medidos: 0 })
      recibidas.set(k, new Map())
    }
    const g = grupos.get(k)!
    if (e.ok) {
      g.enviados++
      if (e.cliente_id) recibidas.get(k)!.set(e.cliente_id, new Date(e.created_at).getTime())
    } else g.fallidos++
  }

  // Turnos creados por esas clientas desde el envio mas viejo del historial
  const ids = [...new Set([...recibidas.values()].flatMap(m => [...m.keys()]))]
  const desde = Math.min(...[...recibidas.values()].flatMap(m => [...m.values()]), Date.now())
  const citas: { cliente_id: string; origen: string; created_at: string }[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data: cs, error: ce } = await admin.from('citas').select('cliente_id, origen, created_at')
      .in('cliente_id', ids.slice(i, i + 150)).neq('status', 'cancelada')
      .gte('created_at', new Date(desde).toISOString())
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
    citas.push(...(cs || []) as typeof citas)
  }
  const porClienta = new Map<string, { t: number; web: boolean }[]>()
  for (const c of citas) {
    if (!porClienta.has(c.cliente_id)) porClienta.set(c.cliente_id, [])
    porClienta.get(c.cliente_id)!.push({ t: new Date(c.created_at).getTime(), web: c.origen === 'online' })
  }

  const ahora = Date.now()
  for (const [k, g] of grupos) {
    let primero = Infinity
    for (const [cid, t] of recibidas.get(k)!) {
      primero = Math.min(primero, t)
      const turnos = (porClienta.get(cid) || []).filter(x => x.t >= t && x.t < t + DIAS_ALCANCE * DIA_MS)
      if (!turnos.length) continue
      g.reservaron++
      if (turnos.some(x => x.web)) g.web++; else g.local++
    }
    g.dias_medidos = primero === Infinity ? 0 : Math.min(DIAS_ALCANCE, Math.floor((ahora - primero) / DIA_MS))
  }

  return NextResponse.json({ grupos: [...grupos.values()], bajas: bajas || 0, dias_alcance: DIAS_ALCANCE })
}
