import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET = download servicios as Excel
export async function GET() {
  const { data: servicios, error } = await supabase
    .from('servicios')
    .select('*')
    .order('nombre')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (servicios || []).map((s) => ({
    Nombre: s.nombre,
    Efectivo: s.precio_efectivo,
    'P. Lista': s.precio_mercadopago,
    Duracion: s.duracion_minutos,
    Comentario: s.descripcion || '',
    Activo: s.activo ? 'Si' : 'No',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Set column widths
  ws['!cols'] = [
    { wch: 35 }, // Nombre
    { wch: 12 }, // Efectivo
    { wch: 12 }, // P. Lista
    { wch: 10 }, // Duracion
    { wch: 20 }, // Comentario
    { wch: 8 },  // Activo
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Servicios')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Servicios.xlsx"',
    },
  })
}

// POST = upload Excel to upsert servicios
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
  }

  // Fetch existing servicios to match by nombre
  const { data: existing } = await supabase.from('servicios').select('id, nombre')
  const existingMap = new Map((existing || []).map((s) => [s.nombre.toLowerCase().trim(), s.id]))

  let updated = 0
  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const nombre = ((row['Nombre'] || row['nombre'] || '') as string).toString().trim()
    if (!nombre) {
      skipped++
      continue
    }

    const efectivo = Number(row['Efectivo'] || row['efectivo'] || 0)
    const pLista = Number(row['P. Lista'] || row['p. lista'] || row['Precio Lista'] || 0)
    const duracion = Number(row['Duracion'] || row['duracion'] || row['Duración'] || 30)
    const comentario = ((row['Comentario'] || row['comentario'] || row['Descripcion'] || '') as string).toString().trim()
    const activoRaw = ((row['Activo'] || row['activo'] || 'Si') as string).toString().trim().toLowerCase()
    const activo = activoRaw !== 'no'

    const existingId = existingMap.get(nombre.toLowerCase().trim())

    if (existingId) {
      // Update existing
      const { error } = await supabase
        .from('servicios')
        .update({
          precio_efectivo: efectivo,
          precio_mercadopago: pLista,
          duracion_minutos: duracion,
          descripcion: comentario || null,
          activo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId)
      if (error) {
        errors.push(`Error updating "${nombre}": ${error.message}`)
      } else {
        updated++
      }
    } else {
      // Insert new
      const { error } = await supabase.from('servicios').insert({
        nombre,
        precio_efectivo: efectivo,
        precio_mercadopago: pLista,
        duracion_minutos: duracion,
        descripcion: comentario || null,
        activo,
      })
      if (error) {
        errors.push(`Error creating "${nombre}": ${error.message}`)
      } else {
        created++
      }
    }
  }

  return NextResponse.json({
    total: rows.length,
    updated,
    created,
    skipped,
    errors,
  })
}
