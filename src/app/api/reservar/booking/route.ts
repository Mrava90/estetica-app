import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toAR, diaSemanaAR } from '@/lib/timezone'
import { calcularPrecioConPromo } from '@/lib/promociones'
import { check as rateLimit, getClientIp } from '@/lib/rate-limit'
import type { Promocion } from '@/types/database'

function normalizarTelefono(tel: string): string {
  let t = tel.trim().replace(/\D/g, '')
  if (t.startsWith('5491')) t = t.slice(4)
  else if (t.startsWith('549')) t = t.slice(3)
  else if (t.startsWith('54')) t = t.slice(2)
  if (t.startsWith('15')) t = '11' + t.slice(2)
  if (!t.startsWith('11') && t.length === 8) t = '11' + t
  return t
}

function capitalizeWords(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const sanitize = (s: string) => s.trim().slice(0, 200)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)

// GET /api/reservar/booking?telefono=11...
//   → devuelve SOLO el nombre para mostrar saludo ("Hola, María!") si el cliente ya existe.
//   NO expone email/apellido/DNI para evitar enumeracion y fuga de PII por telefono.
//   El cliente reingresa apellido/DNI/email en el form si los quiere actualizar.
export async function GET(request: NextRequest) {
  // Rate limit: max 30 lookups/min por IP para evitar enumeracion de telefonos
  const ip = getClientIp(request)
  const rl = rateLimit(ip, { name: 'booking-lookup', windowMs: 60_000, max: 30 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas, esperá un momento' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) },
    })
  }

  const tel = request.nextUrl.searchParams.get('telefono')
  if (!tel || tel.length < 8 || tel.length > 20) {
    return NextResponse.json({ found: false })
  }
  const telNorm = normalizarTelefono(tel)
  if (telNorm.length < 8 || telNorm.length > 15) {
    return NextResponse.json({ found: false })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clientes')
    .select('nombre')
    .eq('telefono', telNorm)
    .maybeSingle()

  if (!data) return NextResponse.json({ found: false })
  return NextResponse.json({ found: true, nombre: data.nombre })
}

// POST /api/reservar/booking → crea/actualiza cliente + crea cita
export async function POST(request: NextRequest) {
  // Rate limit: max 10 reservas/min por IP (bloqueo 5 min si se pasa)
  const ip = getClientIp(request)
  const rl = rateLimit(ip, { name: 'booking-post', windowMs: 60_000, max: 10, blockMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas reservas en poco tiempo, esperá un momento' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec ?? 300) },
    })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // fechaFin del body se IGNORA (se calcula server-side desde servicio.duracion_minutos).
  // Ver hallazgo #5: aceptar fechaFin del cliente permite bloquear mas tiempo del debido.
  const { nombre, apellido, telefono, dni, email, servicioId, profesionalId, fechaInicio, reprogramarId } = body

  // Validaciones básicas
  if (!nombre?.trim() || !telefono?.trim()) {
    return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
  }
  if (!servicioId || !profesionalId || !fechaInicio) {
    return NextResponse.json({ error: 'Faltan datos del turno' }, { status: 400 })
  }
  if (!isUUID(servicioId) || !isUUID(profesionalId)) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
  }
  if (reprogramarId !== undefined && !isUUID(reprogramarId)) {
    return NextResponse.json({ error: 'ID de reprogramación inválido' }, { status: 400 })
  }
  if (typeof telefono !== 'string' || telefono.length > 20) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  const telFinal = normalizarTelefono(telefono)
  if (telFinal.length < 8 || telFinal.length > 15) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Validar servicio/profesional activos + duracion real del servicio (para calcular fechaFin)
  // + validar que el profesional realiza ese servicio (hallazgo #6)
  // + traer dias_anticipacion_reserva de configuracion (para respetar la ventana del negocio).
  const [servCheck, profCheck, profServCheck, configCheck] = await Promise.all([
    admin.from('servicios').select('id, precio_efectivo, duracion_minutos').eq('id', servicioId).eq('activo', true).maybeSingle(),
    admin.from('profesionales').select('id, tolerancia_solapamiento_min').eq('id', profesionalId).eq('activo', true).eq('visible_calendario', true).maybeSingle(),
    admin.from('profesional_servicios').select('profesional_id').eq('servicio_id', servicioId).limit(1000),
    admin.from('configuracion').select('dias_anticipacion_reserva').eq('id', 1).maybeSingle(),
  ])
  if (!servCheck.data || !profCheck.data) {
    return NextResponse.json({ error: 'Servicio o profesional inválido' }, { status: 400 })
  }

  // Relacion profesional-servicio: si hay MAP para este servicio y el prof no esta, rechazar.
  // Convencion existente: sin filas en profesional_servicios significa "cualquier prof puede".
  const profsHabilitados = (profServCheck.data || []).map((p) => p.profesional_id)
  if (profsHabilitados.length > 0 && !profsHabilitados.includes(profesionalId)) {
    return NextResponse.json({ error: 'Este profesional no realiza ese servicio' }, { status: 400 })
  }

  // Calcular fechaFin server-side usando la duracion real del servicio.
  // Ademas: aplicar el limite de anticipacion CONFIGURADO por el negocio (default 30 dias
  // si no hay config). Antes usabamos un hardcoded 90 que la UI ya recortaba pero la API
  // no -> una llamada directa podia reservar mas alla de lo permitido.
  const diasAnticipacionMax = Math.max(1, Math.min(365, configCheck?.data?.dias_anticipacion_reserva ?? 30))
  const fInicio = new Date(fechaInicio)
  if (isNaN(fInicio.getTime()) || fInicio.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  const maxFuturo = Date.now() + diasAnticipacionMax * 24 * 60 * 60 * 1000
  if (fInicio.getTime() > maxFuturo) {
    return NextResponse.json({ error: `Solo se puede reservar con hasta ${diasAnticipacionMax} días de anticipación` }, { status: 400 })
  }
  const duracionMin = servCheck.data.duracion_minutos ?? 30
  const fFin = new Date(fInicio.getTime() + duracionMin * 60_000)
  // fechaFin como string ISO para usar mas abajo donde el codigo espera un string
  const fechaFin = fFin.toISOString()

  // Validar que la cita cae dentro del horario laboral del profesional o de un desbloqueo excepcional.
  // Sin esta validación, un cliente con navegador manipulado o estado stale podría reservar
  // horarios que no debían aparecer disponibles. Se usa hora AR para consultar horarios/desbloqueos.
  const fInicioAR = toAR(fInicio)
  const fFinAR = toAR(fFin)
  const dateStr = `${fInicioAR.getFullYear()}-${String(fInicioAR.getMonth() + 1).padStart(2, '0')}-${String(fInicioAR.getDate()).padStart(2, '0')}`
  const diaSemana = diaSemanaAR(fInicio)

  const [horariosRes, desbloqRes, bloqRes] = await Promise.all([
    admin.from('horarios').select('hora_inicio, hora_fin').eq('profesional_id', profesionalId).eq('dia_semana', diaSemana).eq('activo', true),
    admin.from('desbloqueos').select('hora_inicio, hora_fin').eq('profesional_id', profesionalId).eq('fecha', dateStr),
    admin.from('bloqueos').select('fecha_inicio, fecha_fin').eq('profesional_id', profesionalId).gte('fecha_inicio', `${dateStr}T00:00:00`).lt('fecha_inicio', `${dateStr}T23:59:59`),
  ])

  const bloques = [
    ...(horariosRes.data || []).map(h => ({ inicio: h.hora_inicio.slice(0, 5), fin: h.hora_fin.slice(0, 5) })),
    ...(desbloqRes.data || []).map(d => ({ inicio: d.hora_inicio.slice(0, 5), fin: d.hora_fin.slice(0, 5) })),
  ]

  if (bloques.length === 0) {
    return NextResponse.json({ error: 'El profesional no trabaja este día.' }, { status: 400 })
  }

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const iniMinAR = fInicioAR.getHours() * 60 + fInicioAR.getMinutes()
  const finMinAR = fFinAR.getHours() * 60 + fFinAR.getMinutes()

  const dentroDeBloque = bloques.some(b => iniMinAR >= toMin(b.inicio) && finMinAR <= toMin(b.fin))
  if (!dentroDeBloque) {
    return NextResponse.json({ error: 'Ese horario no está disponible. Elegí otro por favor.' }, { status: 400 })
  }

  // Chequear que no caiga dentro de un bloqueo manual
  for (const bloqueo of (bloqRes.data || [])) {
    const bIni = new Date(bloqueo.fecha_inicio)
    const bFin = new Date(bloqueo.fecha_fin)
    if (fInicio < bFin && fFin > bIni) {
      return NextResponse.json({ error: 'Ese horario está bloqueado. Elegí otro por favor.' }, { status: 400 })
    }
  }

  // Nota: el chequeo de conflictos + INSERT se hace atomicamente mas abajo
  // via RPC reservar_cita_atomica (advisory lock por profesional).
  const toleranciaMin = profCheck.data.tolerancia_solapamiento_min || 0

  try {
    // Buscar cliente existente por teléfono
    const { data: existing } = await admin
      .from('clientes')
      .select('id, nombre, apellido, email, dni')
      .eq('telefono', telFinal)
      .maybeSingle()

    let clienteId: string

    if (existing) {
      clienteId = existing.id

      // Verificar que el mismo cliente no tenga otra cita activa que se solape.
      // Físicamente el cliente no puede estar en dos servicios al mismo tiempo.
      // Excluir la cita a reprogramar si la hay (se cancela más abajo).
      const { data: conflictosCliente } = await admin
        .from('citas')
        .select('id, fecha_inicio, profesionales(nombre)')
        .eq('cliente_id', clienteId)
        .in('status', ['pendiente', 'confirmada'])
        .lt('fecha_inicio', fFin.toISOString())
        .gt('fecha_fin', fInicio.toISOString())

      const conflictosReales = (conflictosCliente || []).filter(c => !reprogramarId || c.id !== reprogramarId)
      if (conflictosReales.length > 0) {
        const conf = conflictosReales[0] as any
        const horaConf = new Date(conf.fecha_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        const nombreProf = conf.profesionales?.nombre || 'otra profesional'
        return NextResponse.json({
          error: `Ya tenés un turno reservado en ese horario con ${nombreProf} (${horaConf}). No podés tener dos turnos superpuestos.`,
        }, { status: 409 })
      }

      // Completar SOLO campos vacios del cliente existente. NUNCA pisar valores
      // ya seteados — esto ultimo es la barrera anti-hijack (el reporte de seguridad
      // marco esto como riesgo pero el flujo operativo requiere poder completar
      // datos faltantes de clientas antiguas sin duplicar registros).
      //
      // Trade-off consciente: alguien que conozca el telefono de una cliente sin
      // email podria setear su propio email la primera vez. Mitigacion practica:
      // los datos personales quedan visibles en el dashboard y el staff puede
      // detectar/corregir manualmente.
      const patch: Record<string, string> = {}
      if (!existing.nombre && nombre?.trim()) patch.nombre = capitalizeWords(sanitize(nombre))
      if (!existing.apellido && apellido?.trim()) patch.apellido = capitalizeWords(sanitize(apellido))
      if (!existing.dni && dni?.trim()) patch.dni = sanitize(dni)
      if (!existing.email && email?.trim()) patch.email = sanitize(email).toLowerCase()
      if (Object.keys(patch).length > 0) {
        await admin.from('clientes').update(patch).eq('id', clienteId)
      }
    } else {
      const { data: newCliente, error: cErr } = await admin
        .from('clientes')
        .insert({
          nombre: capitalizeWords(sanitize(nombre)),
          apellido: apellido?.trim() ? capitalizeWords(sanitize(apellido)) : null,
          telefono: telFinal,
          ...(dni?.trim() ? { dni: sanitize(dni) } : {}),
          ...(email?.trim() ? { email: sanitize(email).toLowerCase() } : {}),
        })
        .select('id')
        .single()
      if (cErr || !newCliente) throw cErr || new Error('No se pudo crear cliente')
      clienteId = newCliente.id
    }

    // Calcular precio con promo aplicable (server-side, autoritativo)
    // Asumimos método de pago 'efectivo' porque es lo más común y suele ser donde
    // aplican las promos. Si la promo requiere otro método, no aplica.
    const precioBase = Number(servCheck.data.precio_efectivo) || 0
    const { data: promosActivas } = await admin
      .from('promociones')
      .select('*')
      .eq('activa', true)
    const precioInfo = calcularPrecioConPromo({
      precioBase,
      promociones: (promosActivas || []) as Promocion[],
      fechaInicio,
      servicioId,
      profesionalId,
      metodoPago: 'efectivo',
    })

    // Crear cita ATOMICAMENTE via RPC.
    // La funcion toma pg_advisory_xact_lock por profesional, chequea overlap
    // respetando tolerancia + bloqueos, y hace el INSERT — todo en una tx.
    // Si dos reservas para el mismo prof llegan a la vez, la segunda espera
    // el lock y despues encuentra el slot ocupado -> devuelve HORARIO_OCUPADO.
    const { data: rpcRows, error: rpcErr } = await admin.rpc('reservar_cita_atomica', {
      p_profesional_id: profesionalId,
      p_cliente_id: clienteId,
      p_servicio_id: servicioId,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin,
      p_tolerancia_min: toleranciaMin,
      p_precio_cobrado: precioInfo.precioFinal,
      p_precio_original: precioInfo.descuento > 0 ? precioInfo.precioOriginal : null,
      p_promocion_id: precioInfo.promocionAplicada?.id || null,
      p_origen: 'online',
      p_status: 'pendiente',
    })

    if (rpcErr) throw rpcErr
    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
    if (rpcResult?.err === 'HORARIO_OCUPADO') {
      return NextResponse.json({ error: 'Ese horario acaba de ocuparse. Elegí otro por favor.' }, { status: 409 })
    }
    if (rpcResult?.err === 'HORARIO_BLOQUEADO') {
      return NextResponse.json({ error: 'Ese horario está bloqueado. Elegí otro por favor.' }, { status: 400 })
    }
    if (!rpcResult?.cita_id) {
      throw new Error(rpcResult?.err || 'No se pudo crear cita')
    }
    const citaData = { id: rpcResult.cita_id as string }

    // Reprogramación: cancelar la cita original SOLO si pertenece al mismo cliente.
    // Sin esta verificación, cualquier persona podría cancelar la cita de otro
    // pasando un UUID arbitrario en reprogramarId.
    if (reprogramarId) {
      const { data: citaOriginal } = await admin
        .from('citas')
        .select('id, cliente_id, status')
        .eq('id', reprogramarId)
        .maybeSingle()

      if (citaOriginal && citaOriginal.cliente_id === clienteId && citaOriginal.status !== 'cancelada') {
        await admin.from('citas').update({ status: 'cancelada' }).eq('id', reprogramarId)
      }
      // Si no pertenece al mismo cliente o ya estaba cancelada, ignorar silenciosamente
      // (no revelar al atacante si la cita existe o no).
    }

    return NextResponse.json({ ok: true, citaId: citaData.id, clienteId })
  } catch (err: any) {
    console.error('Error en booking:', err)
    return NextResponse.json({ error: 'Error al crear el turno' }, { status: 500 })
  }
}
