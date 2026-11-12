/**
 * Historial de Servicios > Mails: ultimos envios agrupados por asunto y dia. Solo admin.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const admin = createAdminClient()
  const [{ data, error }, { count: bajas }] = await Promise.all([
    admin.from('mail_envios').select('plantilla_id, asunto, ok, created_at, mail_plantillas(nombre)')
      .order('created_at', { ascending: false }).limit(1000),
    admin.from('clientes').select('id', { count: 'exact', head: true }).not('mail_baja_at', 'is', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const grupos = new Map<string, { dia: string; plantilla: string; enviados: number; fallidos: number }>()
  for (const e of data || []) {
    const p = (e.mail_plantillas as unknown as { nombre: string } | null)?.nombre || '(plantilla borrada)'
    const k = `${dia(e.created_at)}|${e.plantilla_id}`
    if (!grupos.has(k)) grupos.set(k, { dia: dia(e.created_at), plantilla: p, enviados: 0, fallidos: 0 })
    const g = grupos.get(k)!
    if (e.ok) g.enviados++; else g.fallidos++
  }
  return NextResponse.json({ grupos: [...grupos.values()].slice(0, 30), bajas: bajas || 0 })
}
