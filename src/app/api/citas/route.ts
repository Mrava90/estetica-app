import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const bookingSchema = z.object({
  cliente_nombre: z.string().min(2),
  cliente_telefono: z.string().min(8),
  servicio_id: z.string().uuid(),
  profesional_id: z.string().uuid(),
  fecha_inicio: z.string().datetime(),
  fecha_fin: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = bookingSchema.parse(body)

    const supabase = createAdminClient()

    // Check for conflicts
    const { data: conflictos } = await supabase
      .from('citas')
      .select('id')
      .eq('profesional_id', data.profesional_id)
      .in('status', ['pendiente', 'confirmada'])
      .lt('fecha_inicio', data.fecha_fin)
      .gt('fecha_fin', data.fecha_inicio)

    if (conflictos && conflictos.length > 0) {
      return NextResponse.json(
        { error: 'El horario ya no está disponible' },
        { status: 409 }
      )
    }

    // Find or create client
    const { data: existingCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefono', data.cliente_telefono)
      .single()

    let clienteId: string

    if (existingCliente) {
      clienteId = existingCliente.id
    } else {
      const { data: newCliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({ nombre: data.cliente_nombre, telefono: data.cliente_telefono })
        .select('id')
        .single()
      if (clienteError || !newCliente) {
        return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
      }
      clienteId = newCliente.id
    }

    // Get service price (online bookings default to efectivo)
    const { data: servicio } = await supabase
      .from('servicios')
      .select('precio_efectivo')
      .eq('id', data.servicio_id)
      .single()

    // Create appointment
    const { data: cita, error: citaError } = await supabase
      .from('citas')
      .insert({
        cliente_id: clienteId,
        profesional_id: data.profesional_id,
        servicio_id: data.servicio_id,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        precio_cobrado: servicio?.precio_efectivo || null,
        origen: 'online',
        status: 'pendiente',
      })
      .select()
      .single()

    if (citaError) {
      return NextResponse.json({ error: 'Error al crear cita' }, { status: 500 })
    }

    return NextResponse.json({ cita }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
