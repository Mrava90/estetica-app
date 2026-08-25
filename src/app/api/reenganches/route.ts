import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/reenganches
 *
 * Devuelve clientes que:
 *  1. Se atendieron (cita completada) hace entre 21 y 28 días
 *  2. NO tienen reenganche_enviado marcado
 *  3. NO volvieron después (no hay cita completada posterior a la ventana)
 *  4. NO tienen turno futuro pendiente/confirmado en los próximos 30 días
 *  5. Tienen teléfono válido
 *
 * IMPORTANTE: la mayoría de las citas vienen del sync de Sheets con cliente_id=NULL.
 * El nombre del cliente está en `notas` con formato "[SSR] Nombre Cliente - Servicio | com:xxxx".
 * Extraemos el nombre y hacemos match con la tabla clientes por nombre normalizado.
 */
export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // ?tipo=enviados devuelve los que ya se marcaron (para poder revertir)
  //   Ventana ampliada a 60 días para poder recuperar envíos recientes.
  // Por default (sin param o ?tipo=pendientes): 21-28 días sin marcar.
  const tipo = new URL(request.url).searchParams.get('tipo') || 'pendientes'
  const soloEnviados = tipo === 'enviados'

  const hoy = new Date()
  const diasAtras = soloEnviados ? 60 : 28
  const desde = new Date(hoy); desde.setDate(desde.getDate() - diasAtras)
  const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - (soloEnviados ? 0 : 21))
  const futuroHasta = new Date(hoy); futuroHasta.setDate(futuroHasta.getDate() + 30)

  const desdeISO = desde.toISOString()
  const hastaISO = hasta.toISOString()
  const hoyISO = hoy.toISOString()
  const futuroISO = futuroHasta.toISOString()

  // 1. Traer TODAS las citas completadas en la ventana (con o sin cliente_id)
  const { data: candidatas, error } = await admin
    .from('citas')
    .select('id, fecha_inicio, cliente_id, notas, servicio_id, profesional_id, clientes(id, nombre, apellido, telefono), servicios(nombre), profesionales(nombre)')
    .eq('status', 'completada')
    .eq('reenganche_enviado', soloEnviados)
    .gte('fecha_inicio', desdeISO)
    .lte('fecha_inicio', hastaISO)
    .order('fecha_inicio', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Traer TODOS los clientes con teléfono para hacer match por nombre
  //    (~600 clientes total según lo que sabemos)
  const { data: clientesData } = await admin
    .from('clientes')
    .select('id, nombre, apellido, telefono')
    .not('telefono', 'is', null)
    .limit(5000)

  // Índice de clientes por nombre normalizado
  type ClienteRow = { id: string; nombre: string; apellido: string | null; telefono: string | null }
  const clientesPorNombre = new Map<string, ClienteRow>()
  for (const cli of (clientesData || []) as ClienteRow[]) {
    if (!cli.nombre) continue
    const key = normalizarNombre(`${cli.nombre} ${cli.apellido || ''}`)
    if (!clientesPorNombre.has(key)) clientesPorNombre.set(key, cli)
    const keyCorto = normalizarNombre(cli.nombre)
    if (!clientesPorNombre.has(keyCorto)) clientesPorNombre.set(keyCorto, cli)
  }

  // 3. Enriquecer cada candidata resolviendo cliente por match de nombre si falta
  type Candidata = {
    cita_id: string
    cliente_id: string | null
    nombre: string
    apellido: string | null
    telefono: string | null
    fecha_servicio: string
    servicio_nombre: string
    profesional_nombre: string | null
  }
  const enriquecidas: Candidata[] = []

  for (const cita of candidatas || []) {
    const cli = Array.isArray(cita.clientes) ? cita.clientes[0] : cita.clientes
    const serv = Array.isArray(cita.servicios) ? cita.servicios[0] : cita.servicios
    const prof = Array.isArray(cita.profesionales) ? cita.profesionales[0] : cita.profesionales

    let nombre = cli?.nombre
    let apellido = cli?.apellido
    let telefono = cli?.telefono
    let clienteId = cita.cliente_id
    let servicioNombre = serv?.nombre

    // Si no hay cliente_id, parsear del notas y buscar en clientes
    if (!clienteId && cita.notas) {
      const parsed = parseNombreServicio(cita.notas)
      if (parsed) {
        servicioNombre = servicioNombre || parsed.servicio
        // Buscar match: primero nombre + apellido, después solo nombre
        const nombreCompleto = normalizarNombre(parsed.nombreCompleto)
        const soloPrimer = normalizarNombre(parsed.nombreCompleto.split(/\s+/)[0])
        const match = clientesPorNombre.get(nombreCompleto) || clientesPorNombre.get(soloPrimer)
        if (match) {
          clienteId = match.id
          nombre = match.nombre
          apellido = match.apellido
          telefono = match.telefono
        } else {
          // No hay match — no podemos contactar
          continue
        }
      } else continue
    }

    if (!telefono || !clienteId || !nombre) continue

    enriquecidas.push({
      cita_id: cita.id,
      cliente_id: clienteId,
      nombre,
      apellido,
      telefono,
      fecha_servicio: cita.fecha_inicio,
      servicio_nombre: servicioNombre || 'servicio',
      profesional_nombre: prof?.nombre || null,
    })
  }

  // 4. Excluir clientes que volvieron / tienen turno futuro.
  //    NO aplicamos exclusiones cuando pedimos los YA enviados (queremos verlos todos).
  const clienteIds = [...new Set(enriquecidas.map(c => c.cliente_id).filter(Boolean))] as string[]
  const excluidos = new Set<string>()

  if (!soloEnviados && clienteIds.length > 0) {
    const [volvieron, futuros] = await Promise.all([
      // Volvieron: hay cita completada del cliente posterior a la ventana
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .eq('status', 'completada')
        .gt('fecha_inicio', hastaISO),
      // Tienen futuro: turno pend/conf en próximos 30 días
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .in('status', ['pendiente', 'confirmada'])
        .gte('fecha_inicio', hoyISO)
        .lte('fecha_inicio', futuroISO),
    ])
    ;(volvieron.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))
    ;(futuros.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))

    // También excluir por match de nombre en notas de citas posteriores/futuras (sheets sin cliente_id)
    // Para no molestar a alguien que volvió pero su nueva cita también vino de sheets sin match.
    const nombresACheckear = new Set(enriquecidas.map(c => normalizarNombre(`${c.nombre || ''} ${c.apellido || ''}`)))
    const nombresPrimerACheckear = new Set(enriquecidas.map(c => normalizarNombre(c.nombre || '')))

    // Traer citas posteriores/futuras con notas
    const { data: otras } = await admin
      .from('citas')
      .select('cliente_id, notas, status, fecha_inicio')
      .is('cliente_id', null)
      .or(`and(status.eq.completada,fecha_inicio.gt.${hastaISO}),and(status.in.(pendiente,confirmada),fecha_inicio.gte.${hoyISO},fecha_inicio.lte.${futuroISO})`)
      .limit(2000)

    for (const c of otras || []) {
      if (!c.notas) continue
      const p = parseNombreServicio(c.notas)
      if (!p) continue
      const norm = normalizarNombre(p.nombreCompleto)
      const primerNorm = normalizarNombre(p.nombreCompleto.split(/\s+/)[0])
      if (nombresACheckear.has(norm) || nombresPrimerACheckear.has(primerNorm)) {
        for (const cand of enriquecidas) {
          if (!cand.cliente_id) continue
          const candNorm = normalizarNombre(`${cand.nombre || ''} ${cand.apellido || ''}`)
          const candPrimer = normalizarNombre(cand.nombre || '')
          if (candNorm === norm || candPrimer === primerNorm) {
            excluidos.add(cand.cliente_id)
          }
        }
      }
    }
  }

  // 5. Agrupar por cliente (la cita más reciente en la ventana)
  const porCliente = new Map<string, any>()
  for (const c of enriquecidas) {
    if (!c.cliente_id) continue
    if (excluidos.has(c.cliente_id)) continue
    if (porCliente.has(c.cliente_id)) continue
    porCliente.set(c.cliente_id, {
      ...c,
      dias_transcurridos: Math.floor((hoy.getTime() - new Date(c.fecha_servicio).getTime()) / (1000 * 60 * 60 * 24)),
    })
  }

  const { data: config } = await admin.from('configuracion').select('mensaje_reenganche').eq('id', 1).single()

  return NextResponse.json({
    items: Array.from(porCliente.values()),
    mensaje_template: config?.mensaje_reenganche || '¡Hola {nombre}! Hace {dias} días te atendimos con {servicio}. ¿Te gustaría reservar tu próximo turno? 💅✨',
  })
}

// ── Helpers ──────────────────────────────────────────────

/** Extrae "nombre completo" y "servicio" del formato "[SSR] Cliente - Servicio | com:xxxx" */
function parseNombreServicio(notas: string): { nombreCompleto: string; servicio: string } | null {
  // Quitar prefijo [SSR]/[KW] y todo lo que sigue de " | com:..."
  const sinPrefijo = notas.replace(/^\[[^\]]+\]\s*/, '').replace(/\s*\|\s*com:.*$/i, '')
  const m = sinPrefijo.match(/^([^-]+?)\s*-\s*(.+)$/)
  if (!m) return null
  const nombre = m[1].trim()
  const servicio = m[2].trim()
  if (!nombre) return null
  return { nombreCompleto: nombre, servicio: servicio || 'servicio' }
}

/** Normaliza un nombre: minúsculas, sin acentos, espacios colapsados */
function normalizarNombre(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
