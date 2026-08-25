import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarPadron } from '@/lib/afip/padron'
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

  if (!process.env.AFIP_CUIT || !process.env.AFIP_CERT || !process.env.AFIP_KEY) {
    return NextResponse.json({ error: 'Faltan credenciales AFIP' }, { status: 503 })
  }

  try {
    const result = await withCronLog('afip-padron', async () => {
      const admin = createAdminClient()
      const data = await consultarPadron()

      const { data: ultimo } = await admin
        .from('afip_padron_snapshot')
        .select('categoria_monotributo')
        .order('consultado_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const cambioDesde =
        ultimo?.categoria_monotributo &&
        data.categoriaMonotributo &&
        ultimo.categoria_monotributo !== data.categoriaMonotributo
          ? ultimo.categoria_monotributo
          : null

      await admin.from('afip_padron_snapshot').insert({
        cuit: data.cuit,
        estado_clave: data.estadoClave,
        tipo_persona: data.tipoPersona,
        razon_social: data.razonSocial,
        nombre: data.nombre,
        apellido: data.apellido,
        categoria_monotributo: data.categoriaMonotributo,
        categoria_id: data.categoriaId,
        impuestos: data.impuestos,
        actividades: data.actividades,
        domicilios: data.domicilios,
        raw_response: { xml: data.rawXml.slice(0, 50_000) },
        cambio_categoria_desde: cambioDesde,
      })

      return { categoria: data.categoriaMonotributo, cambio: !!cambioDesde, cambio_desde: cambioDesde }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Error cron padron:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
