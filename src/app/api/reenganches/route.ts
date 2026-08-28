import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/reenganches
 *
 * Devuelve clientes candidatos para recontactar por WhatsApp.
 *
 * Regla general: clientes atendidos hace 21-28 dias, que no volvieron ni
 * tienen turno futuro, y a los que TODAVIA no se les envio el reenganche
 * por esta ultima visita.
 *
 * Excepcion por servicio: si la ultima visita fue "lifting" (o similar),
 * la ventana es 30-35 dias porque el tratamiento dura mas.
 *
 * El marcado de "ya enviado" vive en la tabla reenganches_enviados
 * (indexada por cliente_id). Cuando el cliente vuelve, su nueva visita
 * es mas nueva que ultima_visita_al_enviar y vuelve a ser candidato al
 * cumplir los dias correspondientes.
 */
export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const tipo = new URL(request.url).searchParams.get('tipo') || 'pendientes'
  const soloEnviados = tipo === 'enviados'

  const hoy = new Date()
  // Ventana ancha para cubrir tanto default (21-28) como lifting (30-35).
  // Luego filtramos por servicio en memoria.
  const DIAS_MAX_VENTANA = 35
  const DIAS_MIN_VENTANA = 21
  const desde = new Date(hoy); desde.setDate(desde.getDate() - (soloEnviados ? 60 : DIAS_MAX_VENTANA))
  const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - (soloEnviados ? 0 : DIAS_MIN_VENTANA))
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
    .gte('fecha_inicio', desdeISO)
    .lte('fecha_inicio', hastaISO)
    .order('fecha_inicio', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Traer clientes con teléfono para match por nombre
  const { data: clientesData } = await admin
    .from('clientes')
    .select('id, nombre, apellido, telefono')
    .not('telefono', 'is', null)
    .limit(5000)

  type ClienteRow = { id: string; nombre: string; apellido: string | null; telefono: string | null }
  const clientesPorNombre = new Map<string, ClienteRow>()
  for (const cli of (clientesData || []) as ClienteRow[]) {
    if (!cli.nombre) continue
    const key = normalizarNombre(`${cli.nombre} ${cli.apellido || ''}`)
    if (!clientesPorNombre.has(key)) clientesPorNombre.set(key, cli)
    const keyCorto = normalizarNombre(cli.nombre)
    if (!clientesPorNombre.has(keyCorto)) clientesPorNombre.set(keyCorto, cli)
  }

  // 3. Enriquecer + resolver cliente por match de nombre si falta
  type Candidata = {
    cita_id: string
    cliente_id: string | null
    nombre: string
    apellido: string | null
    telefono: string | null
    fecha_servicio: string
    servicio_nombre: string
    profesional_nombre: string | null
    dias_transcurridos: number
    ventana_min: number
    ventana_max: number
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
        const nombreCompleto = normalizarNombre(parsed.nombreCompleto)
        const soloPrimer = normalizarNombre(parsed.nombreCompleto.split(/\s+/)[0])
        const match = clientesPorNombre.get(nombreCompleto) || clientesPorNombre.get(soloPrimer)
        if (match) {
          clienteId = match.id
          nombre = match.nombre
          apellido = match.apellido
          telefono = match.telefono
        } else continue
      } else continue
    }

    if (!telefono || !clienteId || !nombre) continue

    // Ventana por servicio: lifting -> 30-35, resto -> 21-28
    const [ventanaMin, ventanaMax] = ventanaPorServicio(servicioNombre || '')

    const diasTranscurridos = Math.floor(
      (hoy.getTime() - new Date(cita.fecha_inicio).getTime()) / (1000 * 60 * 60 * 24)
    )
    // Cuando pedimos "enviados" mostramos historial ancho; para "pendientes" filtramos estricto
    if (!soloEnviados && (diasTranscurridos < ventanaMin || diasTranscurridos > ventanaMax)) continue

    enriquecidas.push({
      cita_id: cita.id,
      cliente_id: clienteId,
      nombre,
      apellido,
      telefono,
      fecha_servicio: cita.fecha_inicio,
      servicio_nombre: servicioNombre || 'servicio',
      profesional_nombre: prof?.nombre || null,
      dias_transcurridos: diasTranscurridos,
      ventana_min: ventanaMin,
      ventana_max: ventanaMax,
    })
  }

  const clienteIds = [...new Set(enriquecidas.map(c => c.cliente_id).filter(Boolean))] as string[]
  const excluidos = new Set<string>()

  // 4. Traer marcados previos (persistentes, no se pierden con sync de sheets)
  //    y decidir si el cliente sigue "cubierto" por un envio pasado.
  const enviadosPorCliente = new Map<string, string>()  // cliente_id -> ISO ultima_visita_al_enviar
  if (clienteIds.length > 0) {
    const { data: enviados } = await admin
      .from('reenganches_enviados')
      .select('cliente_id, ultima_visita_al_enviar')
      .in('cliente_id', clienteIds)
    for (const r of enviados || []) {
      enviadosPorCliente.set(r.cliente_id as string, r.ultima_visita_al_enviar as string)
    }
  }

  if (!soloEnviados && clienteIds.length > 0) {
    // Excluir clientes que YA recibieron mensaje por una visita del mismo DIA (o posterior).
    //
    // Comparamos por DIA porque el sync-sheets asigna horas ficticias (9:00, 9:05, ...)
    // que cambian entre corridas si se reordenan filas en Sheets. Un cliente cuya cita
    // ayer estaba en dia D 09:05 puede aparecer hoy como dia D 09:15 (misma fecha real).
    // Comparar por dia evita que el cliente reaparezca por un cambio irrelevante de hora
    // ficticia. Solo debe volver a aparecer si tiene una visita en un DIA posterior.
    const enviadosPorClienteDia = new Map<string, string>()
    for (const [cid, iso] of enviadosPorCliente.entries()) {
      enviadosPorClienteDia.set(cid, iso.slice(0, 10))  // 'YYYY-MM-DD'
    }
    for (const c of enriquecidas) {
      if (!c.cliente_id) continue
      const yaEnviadoDia = enviadosPorClienteDia.get(c.cliente_id)
      const candidataDia = c.fecha_servicio.slice(0, 10)
      if (yaEnviadoDia && yaEnviadoDia >= candidataDia) {
        excluidos.add(c.cliente_id)
      }
    }

    // Excluir clientes que volvieron / tienen turno futuro
    const [volvieron, futuros] = await Promise.all([
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .eq('status', 'completada')
        .gt('fecha_inicio', hastaISO),
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .in('status', ['pendiente', 'confirmada'])
        .gte('fecha_inicio', hoyISO)
        .lte('fecha_inicio', futuroISO),
    ])
    ;(volvieron.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))
    ;(futuros.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))

    // También excluir por match de nombre en notas de citas posteriores/futuras (sheets sin cliente_id)
    const nombresACheckear = new Set(enriquecidas.map(c => normalizarNombre(`${c.nombre || ''} ${c.apellido || ''}`)))
    const nombresPrimerACheckear = new Set(enriquecidas.map(c => normalizarNombre(c.nombre || '')))

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

  // 5. Agrupar por cliente. Para "pendientes" tomamos la mas RECIENTE (mas nueva);
  //    para "enviados" tambien mas reciente asi se lista una sola fila por cliente.
  const porCliente = new Map<string, Candidata>()
  for (const c of enriquecidas) {
    if (!c.cliente_id) continue
    if (excluidos.has(c.cliente_id)) continue

    // Cuando pedimos "enviados" solo dejamos los que estan en reenganches_enviados
    if (soloEnviados && !enviadosPorCliente.has(c.cliente_id)) continue

    if (porCliente.has(c.cliente_id)) continue
    porCliente.set(c.cliente_id, c)
  }

  const { data: config } = await admin.from('configuracion').select('mensaje_reenganche').eq('id', 1).single()

  return NextResponse.json({
    items: Array.from(porCliente.values()),
    mensaje_template: config?.mensaje_reenganche || '¡Hola {nombre}! Hace {dias} días te atendimos con {servicio}. ¿Te gustaría reservar tu próximo turno? 💅✨',
  })
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Ventana de dias por servicio. Retorna [min, max].
 * - Lifting: 30-35 dias (tratamiento dura mas)
 * - Default: 21-28 dias
 */
function ventanaPorServicio(nombre: string): [number, number] {
  const norm = nombre.toLowerCase()
  if (norm.includes('lifting')) return [30, 35]
  return [21, 28]
}

/** Extrae "nombre completo" y "servicio" del formato "[SSR] Cliente - Servicio | com:xxxx" */
function parseNombreServicio(notas: string): { nombreCompleto: string; servicio: string } | null {
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
