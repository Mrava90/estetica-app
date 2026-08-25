import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withCronLog } from '@/lib/cron-logger'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await withCronLog('ranking-servicios', async () => {
    const admin = createAdminClient()

    // Contar citas de los últimos 60 días por servicio
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const { data: citas } = await admin
      .from('citas')
      .select('servicio_id')
      .gte('fecha_inicio', sixtyDaysAgo.toISOString())
      .in('status', ['completada', 'confirmada', 'pendiente'])
      .not('servicio_id', 'is', null)

    const counts: Record<string, number> = {}
    for (const c of citas || []) {
      if (c.servicio_id) counts[c.servicio_id] = (counts[c.servicio_id] || 0) + 1
    }

    // Top 5 servicios más solicitados
    const top5 = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    // Resetear todos a null
    await admin.from('servicios').update({ orden_reserva: null }).neq('id', '00000000-0000-0000-0000-000000000000')

    // Asignar orden 1-5 a los top
    for (let i = 0; i < top5.length; i++) {
      await admin.from('servicios').update({ orden_reserva: i + 1 }).eq('id', top5[i][0])
    }

      return { top5: top5.map(([id, count], i) => ({ rank: i + 1, servicio_id: id, count })) }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Error ranking servicios:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
