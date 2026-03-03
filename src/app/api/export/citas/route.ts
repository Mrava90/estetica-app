import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const profesionalId = searchParams.get('profesional_id')

  const supabase = getSupabase()

  let query = supabase
    .from('citas')
    .select('*, clientes(*), profesionales(*), servicios(*)')
    .order('fecha_inicio', { ascending: false })

  if (status) query = query.eq('status', status)
  if (profesionalId) query = query.eq('profesional_id', profesionalId)

  const { data: citas, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (citas || []).map((c) => {
    const dt = new Date(c.fecha_inicio)
    const fecha = dt.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    const hora = dt.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    })
    return {
      Fecha: fecha,
      Hora: hora,
      Cliente: c.clientes?.nombre ?? '',
      Teléfono: c.clientes?.telefono ?? '',
      Servicio: c.servicios?.nombre ?? '',
      Profesional: c.profesionales?.nombre ?? '',
      Estado: c.status,
      Precio: c.precio_cobrado ?? '',
      'Método Pago': c.metodo_pago ?? '',
      Notas: c.notas ?? '',
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  ws['!cols'] = [
    { wch: 12 }, // Fecha
    { wch: 8 },  // Hora
    { wch: 25 }, // Cliente
    { wch: 15 }, // Teléfono
    { wch: 30 }, // Servicio
    { wch: 15 }, // Profesional
    { wch: 12 }, // Estado
    { wch: 12 }, // Precio
    { wch: 14 }, // Método Pago
    { wch: 30 }, // Notas
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Citas')

  const today = new Date().toISOString().slice(0, 10)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Citas-${today}.xlsx"`,
    },
  })
}
