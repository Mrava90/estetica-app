import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularSlotsDisponibles } from '@/lib/disponibilidad'
import { parseTimeToDateAR, diaSemanaAR } from '@/lib/timezone'
import { check as rateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/reservar/disponibilidad?servicioId=X&fecha=YYYY-MM-DD[&profesionalId=Y]
 *
 * API PUBLICA que devuelve los slots disponibles para reservar.
 * Todo el calculo ocurre server-side con el service_role client — el cliente
 * NO consulta directo Supabase (esa policy anon fue eliminada en la migration
 * de seguridad). Bloqueos, citas y horarios de otros clientes ya no se
 * filtran mas al navegador: solo devolvemos horarios reservables.
 *
 * Response:
 *   { slots: { [profesionalId]: [{ inicio: ISO, fin: ISO }, ...] } }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const INTERVALO_MIN = 30
const MAX_DIAS_ANTICIPACION = 90

export async function GET(request: NextRequest) {
  // Rate limit: max 60 consultas/min por IP
  const ip = getClientIp(request)
  const rl = rateLimit(ip, { name: 'disponibilidad', windowMs: 60_000, max: 60 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) },
    })
  }

  const { searchParams } = new URL(request.url)
  const servicioId = searchParams.get('servicioId')
  const fechaStr = searchParams.get('fecha')
  const profesionalIdParam = searchParams.get('profesionalId')

  if (!servicioId || !UUID_RE.test(servicioId)) {
    return NextResponse.json({ error: 'servicioId inválido' }, { status: 400 })
  }
  if (!fechaStr || !YMD_RE.test(fechaStr)) {
    return NextResponse.json({ error: 'fecha inválida (esperado YYYY-MM-DD)' }, { status: 400 })
  }
  if (profesionalIdParam && !UUID_RE.test(profesionalIdParam)) {
    return NextResponse.json({ error: 'profesionalId inválido' }, { status: 400 })
  }

  // Fecha no en el pasado y dentro de la ventana permitida
  const fecha = new Date(`${fechaStr}T00:00:00-03:00`)  // interpretar como AR
  if (isNaN(fecha.getTime())) {
    return NextResponse.json({ error: 'fecha inválida' }, { status: 400 })
  }
  const hoyMs = new Date().setHours(0, 0, 0, 0)
  const maxFuturoMs = hoyMs + MAX_DIAS_ANTICIPACION * 24 * 60 * 60 * 1000
  if (fecha.getTime() < hoyMs - 24 * 60 * 60 * 1000 || fecha.getTime() > maxFuturoMs) {
    return NextResponse.json({ slots: {} })
  }

  const admin = createAdminClient()

  // 1. Servicio activo + duracion
  const { data: servicio } = await admin
    .from('servicios')
    .select('id, duracion_minutos, activo')
    .eq('id', servicioId)
    .eq('activo', true)
    .maybeSingle()
  if (!servicio) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 404 })
  }

  // 2. Profesionales que pueden hacer ese servicio (respetando el join profesional_servicios).
  //    Si esta vacio en profesional_servicios, convencion existente: todos los activos.
  const { data: profServMap } = await admin
    .from('profesional_servicios')
    .select('profesional_id')
    .eq('servicio_id', servicioId)

  let profesionalesQuery = admin
    .from('profesionales')
    .select('id, tolerancia_solapamiento_min')
    .eq('activo', true)
    .eq('visible_calendario', true)

  const habilitadosIds = (profServMap || []).map((p) => p.profesional_id)
  if (habilitadosIds.length > 0) {
    profesionalesQuery = profesionalesQuery.in('id', habilitadosIds)
  }
  if (profesionalIdParam) {
    profesionalesQuery = profesionalesQuery.eq('id', profesionalIdParam)
  }

  const { data: profesionales } = await profesionalesQuery
  if (!profesionales || profesionales.length === 0) {
    return NextResponse.json({ slots: {} })
  }

  const profIds = profesionales.map((p) => p.id)
  // dia_semana en AR (evita off-by-one si el proceso corre en UTC)
  const diaSemana = diaSemanaAR(fecha)
  const dateStr = fechaStr

  // 3. Horarios/desbloqueos/citas/bloqueos del dia, en paralelo
  const [horariosRes, desbloqRes, citasRes, bloqRes] = await Promise.all([
    admin.from('horarios')
      .select('profesional_id, hora_inicio, hora_fin')
      .in('profesional_id', profIds).eq('dia_semana', diaSemana).eq('activo', true)
      .order('hora_inicio'),
    admin.from('desbloqueos')
      .select('profesional_id, hora_inicio, hora_fin')
      .in('profesional_id', profIds).eq('fecha', dateStr),
    admin.from('citas')
      .select('profesional_id, fecha_inicio, fecha_fin')
      .in('profesional_id', profIds).in('status', ['pendiente', 'confirmada'])
      .gte('fecha_inicio', `${dateStr}T00:00:00`).lt('fecha_inicio', `${dateStr}T23:59:59`),
    admin.from('bloqueos')
      .select('profesional_id, fecha_inicio, fecha_fin')
      .in('profesional_id', profIds)
      .gte('fecha_inicio', `${dateStr}T00:00:00`).lt('fecha_inicio', `${dateStr}T23:59:59`),
  ])

  // 4. Calcular slots por profesional
  const slots: Record<string, Array<{ inicio: string; fin: string }>> = {}

  for (const prof of profesionales) {
    const horarios = (horariosRes.data || []).filter((h) => h.profesional_id === prof.id)
    const citas = (citasRes.data || []).filter((c) => c.profesional_id === prof.id)
    const bloqueos = (bloqRes.data || []).filter((b) => b.profesional_id === prof.id)
    const profDesbloqueos = (desbloqRes.data || []).filter((d) => d.profesional_id === prof.id)

    const todosHorarios = [
      ...horarios.map((h) => ({ hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      ...profDesbloqueos.map((d) => ({ hora_inicio: d.hora_inicio, hora_fin: d.hora_fin })),
    ]

    const tolerancia = prof.tolerancia_solapamiento_min || 0
    const disponibles: Array<{ inicio: Date; fin: Date }> = []
    for (const horario of todosHorarios) {
      disponibles.push(...calcularSlotsDisponibles(
        fecha,
        { hora_inicio: horario.hora_inicio, hora_fin: horario.hora_fin },
        citas,
        servicio.duracion_minutos ?? 30,
        INTERVALO_MIN,
        bloqueos,
        tolerancia,
        parseTimeToDateAR,  // interpreta HH:mm como hora AR (server-side en UTC)
      ))
    }

    if (disponibles.length > 0) {
      slots[prof.id] = disponibles.map((s) => ({
        inicio: s.inicio.toISOString(),
        fin: s.fin.toISOString(),
      }))
    }
  }

  return NextResponse.json({ slots })
}
