import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { toAR, fechaArYMD } from '@/lib/timezone'

/**
 * GET /api/reenganches
 *
 * Devuelve clientes candidatos para recontactar por WhatsApp.
 *
 * Fuente de verdad: citas del CALENDARIO (origen manual/online), NO sheets.
 * Motivos:
 * - Las citas del calendario tienen cliente_id real (identidad estable).
 * - Las de sheets nacen con cliente_id=null y se recrean cada dia (id inestable).
 * - Contexto operativo del negocio: el turno se toma por la app pero nadie lo
 *   marca como 'completada'. Se anota en sheets para caja/comisiones. Por eso
 *   incluimos todos los status que implican "la persona vino": pendiente,
 *   confirmada, completada. Cancelada y no_asistio se excluyen.
 *
 * Regla general: 21-28 dias desde la ultima visita. Lifting: 30-35 dias.
 *
 * Exclusiones:
 * - Ya se envio WhatsApp por una visita del mismo dia o posterior (persistente
 *   en reenganches_enviados, sobrevive al sync-sheets).
 * - El cliente ya volvio (cita del mismo cliente entre hace 21 dias y hoy).
 * - El cliente tiene turno futuro pendiente/confirmado en los proximos 30 dias.
 *
 * Pospuestas (tabla reenganches_pospuestos, ver /posponer):
 * - Mientras hasta > hoy, la alerta no aparece en Pendientes.
 * - Desde ese dia vuelve con la nota, aunque este fuera de la ventana y aunque
 *   ya se le haya mandado el WhatsApp. Se cae si la clienta saco turno despues
 *   de la visita. ?tipo=programadas lista las que todavia no vencieron.
 */

const ESTADOS_VALIDOS = ['pendiente', 'confirmada', 'completada']

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const tipo = new URL(request.url).searchParams.get('tipo') || 'pendientes'
  const soloEnviados = tipo === 'enviados'

  const hoyYMDAR = fechaArYMD(new Date())
  const { data: pospuestosRaw } = await admin
    .from('reenganches_pospuestos')
    .select('cliente_id, hasta, nota, ultima_visita, servicio_nombre, profesional_nombre, clientes(nombre, apellido, telefono)')
  const pospuestos = new Map((pospuestosRaw || []).map(p => [p.cliente_id as string, p]))

  if (tipo === 'programadas') {
    const items = (pospuestosRaw || [])
      .filter(p => (p.hasta as string) > hoyYMDAR)
      .map(p => itemDePospuesto(p, hoyYMDAR))
      .filter(Boolean)
      .sort((a, b) => a!.pospuesto!.hasta.localeCompare(b!.pospuesto!.hasta))
    const { data: cfg } = await admin.from('configuracion').select('mensaje_reenganche').eq('id', 1).single()
    return NextResponse.json({ items, mensaje_template: cfg?.mensaje_reenganche || MENSAJE_DEFAULT })
  }

  // Dia calendario en Argentina (evita off-by-one con el TZ del server)
  const hoyAR = toAR(new Date())
  const hoy = new Date()

  // Ventana ancha: 21-35 dias para cubrir default + lifting.
  // Para "enviados" ampliamos a 60 dias para poder mostrar historial.
  const DIAS_MAX = soloEnviados ? 60 : 35
  const DIAS_MIN = soloEnviados ? 0 : 21
  const desdeAR = new Date(hoyAR); desdeAR.setDate(desdeAR.getDate() - DIAS_MAX)
  const hastaAR = new Date(hoyAR); hastaAR.setDate(hastaAR.getDate() - DIAS_MIN)

  // Fechas ISO para query en DB (los timestamps de la DB estan en UTC pero se
  // comparan bien contra cualquier ISO). Uso 00:00 y 23:59 del dia AR.
  const desdeISO = fechaArYMD(desdeAR) + 'T00:00:00-03:00'
  const hastaISO = fechaArYMD(hastaAR) + 'T23:59:59-03:00'

  // Rango de "volvio" y "turno futuro"
  const volvioDesdeISO = new Date(hoyAR); volvioDesdeISO.setDate(volvioDesdeISO.getDate() - 20)  // desde hace 20 dias
  const futuroHastaAR = new Date(hoyAR); futuroHastaAR.setDate(futuroHastaAR.getDate() + 30)

  // 1. Traer citas del calendario en la ventana. Excluimos sheets porque no tienen
  //    cliente_id real. Usamos cliente_id NOT NULL como filtro seguro.
  const { data: candidatasRaw, error } = await admin
    .from('citas')
    .select('id, fecha_inicio, cliente_id, servicios(nombre), profesionales(nombre), clientes(nombre, apellido, telefono)')
    .not('cliente_id', 'is', null)
    .in('status', ESTADOS_VALIDOS)
    .gte('fecha_inicio', desdeISO)
    .lte('fecha_inicio', hastaISO)
    .order('fecha_inicio', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Enriquecer + calcular dias transcurridos con ventana por servicio
  type Candidata = {
    cita_id: string
    cliente_id: string
    nombre: string
    apellido: string | null
    telefono: string | null
    fecha_servicio: string
    servicio_nombre: string
    profesional_nombre: string | null
    dias_transcurridos: number
    ventana_min: number
    ventana_max: number
    pospuesto?: { hasta: string; nota: string | null }
  }
  const enriquecidas: Candidata[] = []

  for (const cita of candidatasRaw || []) {
    const cli = Array.isArray(cita.clientes) ? cita.clientes[0] : cita.clientes as any
    const serv = Array.isArray(cita.servicios) ? cita.servicios[0] : cita.servicios as any
    const prof = Array.isArray(cita.profesionales) ? cita.profesionales[0] : cita.profesionales as any

    if (!cli?.telefono || !cli?.nombre || !cita.cliente_id) continue

    const servicioNombre = serv?.nombre || 'servicio'
    const [ventanaMin, ventanaMax] = ventanaPorServicio(servicioNombre)

    // Dias calendario AR: (hoy AR YMD) - (fecha visita AR YMD)
    const fechaVisitaYMD = fechaArYMD(cita.fecha_inicio)
    const hoyYMD = fechaArYMD(hoyAR)
    const diasTranscurridos = diffDiasYMD(hoyYMD, fechaVisitaYMD)

    // Para "pendientes" filtramos estricto por ventana; para "enviados" mostramos todo
    if (!soloEnviados && (diasTranscurridos < ventanaMin || diasTranscurridos > ventanaMax)) continue

    enriquecidas.push({
      cita_id: cita.id,
      cliente_id: cita.cliente_id,
      nombre: cli.nombre,
      apellido: cli.apellido,
      telefono: cli.telefono,
      fecha_servicio: cita.fecha_inicio,
      servicio_nombre: servicioNombre,
      profesional_nombre: prof?.nombre || null,
      dias_transcurridos: diasTranscurridos,
      ventana_min: ventanaMin,
      ventana_max: ventanaMax,
    })
  }

  const clienteIds = [...new Set(enriquecidas.map(c => c.cliente_id))]
  const excluidos = new Set<string>()

  // 3. Marcados previos (tabla persistente)
  const enviadosPorClienteDia = new Map<string, string>()  // cliente_id -> YYYY-MM-DD
  if (clienteIds.length > 0) {
    const { data: enviados } = await admin
      .from('reenganches_enviados')
      .select('cliente_id, ultima_visita_al_enviar')
      .in('cliente_id', clienteIds)
    for (const r of enviados || []) {
      enviadosPorClienteDia.set(r.cliente_id as string, (r.ultima_visita_al_enviar as string).slice(0, 10))
    }
  }

  // 4. Aplicar exclusiones solo cuando NO estamos pidiendo el listado de enviados
  if (!soloEnviados && clienteIds.length > 0) {
    // 4a. Ya recibio WhatsApp por esta visita (o posterior) — comparar por dia
    for (const c of enriquecidas) {
      const yaEnviadoDia = enviadosPorClienteDia.get(c.cliente_id)
      const candidataDia = c.fecha_servicio.slice(0, 10)
      if (yaEnviadoDia && yaEnviadoDia >= candidataDia) excluidos.add(c.cliente_id)
    }

    // 4b. Volvio recientemente: cita del mismo cliente entre hace 20 dias y hoy (con status valido)
    // 4c. Tiene turno futuro pendiente/confirmado
    const [volvieronRes, futurosRes] = await Promise.all([
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .in('status', ESTADOS_VALIDOS)
        .gte('fecha_inicio', volvioDesdeISO.toISOString())
        .lte('fecha_inicio', hoy.toISOString()),
      admin.from('citas').select('cliente_id')
        .in('cliente_id', clienteIds)
        .in('status', ['pendiente', 'confirmada'])
        .gt('fecha_inicio', hoy.toISOString())
        .lte('fecha_inicio', futuroHastaAR.toISOString()),
    ])
    ;(volvieronRes.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))
    ;(futurosRes.data || []).forEach(c => c.cliente_id && excluidos.add(c.cliente_id))
  }

  // 5. Dedup por cliente: nos quedamos con la visita MAS RECIENTE en la ventana
  const porCliente = new Map<string, Candidata>()
  for (const c of enriquecidas) {
    if (excluidos.has(c.cliente_id)) continue
    if (soloEnviados && !enviadosPorClienteDia.has(c.cliente_id)) continue
    const prev = porCliente.get(c.cliente_id)
    if (!prev || new Date(c.fecha_servicio) > new Date(prev.fecha_servicio)) {
      porCliente.set(c.cliente_id, c)
    }
  }

  // 6. Pospuestas
  if (soloEnviados) {
    // Marcar las que tienen un recordatorio programado
    for (const c of porCliente.values()) {
      const p = pospuestos.get(c.cliente_id)
      if (p) c.pospuesto = { hasta: p.hasta as string, nota: (p.nota as string) || null }
    }
  } else {
    // 6a. Todavia no llego el dia: fuera de Pendientes
    for (const [id, p] of pospuestos) if ((p.hasta as string) > hoyYMDAR) porCliente.delete(id)

    // 6b. Ya llego el dia: vuelve, salvo que haya sacado turno despues de esa visita
    const vencidas = [...pospuestos.values()].filter(p => (p.hasta as string) <= hoyYMDAR)
    if (vencidas.length > 0) {
      const ids = vencidas.map(p => p.cliente_id as string)
      const desdeVisita = vencidas.map(p => p.ultima_visita as string).sort()[0]
      const { data: posteriores } = await admin.from('citas').select('cliente_id, fecha_inicio')
        .in('cliente_id', ids)
        .in('status', ESTADOS_VALIDOS)
        .gt('fecha_inicio', desdeVisita)
      const volvio = new Set<string>()
      for (const c of posteriores || []) {
        const p = pospuestos.get(c.cliente_id as string)
        // Otra cita en un dia posterior al de la visita de la alerta
        if (p && fechaArYMD(c.fecha_inicio as string) > fechaArYMD(p.ultima_visita as string)) volvio.add(c.cliente_id as string)
      }
      for (const p of vencidas) {
        if (volvio.has(p.cliente_id as string)) continue
        const item = itemDePospuesto(p, hoyYMDAR)
        if (item) porCliente.set(p.cliente_id as string, item)
      }
    }
  }

  const { data: config } = await admin
    .from('configuracion')
    .select('mensaje_reenganche')
    .eq('id', 1)
    .single()

  return NextResponse.json({
    items: Array.from(porCliente.values()),
    mensaje_template: config?.mensaje_reenganche || MENSAJE_DEFAULT,
  })
}

const MENSAJE_DEFAULT = '¡Hola {nombre}! Hace {dias} días te atendimos con {servicio}. ¿Te gustaría reservar tu próximo turno? 💅✨'

type ItemReenganche = {
  cita_id: string
  cliente_id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  fecha_servicio: string
  servicio_nombre: string
  profesional_nombre: string | null
  dias_transcurridos: number
  ventana_min: number
  ventana_max: number
  pospuesto?: { hasta: string; nota: string | null }
}

/** Arma un item de la lista a partir de una fila de reenganches_pospuestos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemDePospuesto(p: any, hoyYMD: string): ItemReenganche | null {
  const cli = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes
  if (!cli?.nombre) return null
  const servicio = p.servicio_nombre || 'servicio'
  const [vmin, vmax] = ventanaPorServicio(servicio)
  return {
    cita_id: 'pos-' + p.cliente_id,
    cliente_id: p.cliente_id,
    nombre: cli.nombre,
    apellido: cli.apellido,
    telefono: cli.telefono,
    fecha_servicio: p.ultima_visita,
    servicio_nombre: servicio,
    profesional_nombre: p.profesional_nombre || null,
    dias_transcurridos: diffDiasYMD(hoyYMD, fechaArYMD(p.ultima_visita)),
    ventana_min: vmin,
    ventana_max: vmax,
    pospuesto: { hasta: p.hasta, nota: p.nota || null },
  }
}

// ── Helpers ──────────────────────────────────────────────

function ventanaPorServicio(nombre: string): [number, number] {
  return nombre.toLowerCase().includes('lifting') ? [30, 35] : [21, 28]
}

/** Diferencia en dias calendario entre dos fechas YMD (ambas 'YYYY-MM-DD'). Positivo si a > b. */
function diffDiasYMD(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((da - db) / 86_400_000)
}
