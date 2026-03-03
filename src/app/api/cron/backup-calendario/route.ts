import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { backupCalendarioToSheets, backupClientesToSheets } from '@/lib/sheets-backup'
import { isAdminEmail } from '@/lib/constants'

async function runBackup() {
  const supabase = createAdminClient()
  const [calendario, clientes] = await Promise.all([
    backupCalendarioToSheets(supabase),
    backupClientesToSheets(supabase),
  ])
  return { citasBackedUp: calendario.citasBackedUp, clientesBackedUp: clientes.clientesBackedUp }
}

// Cron automático (llamado por Vercel con CRON_SECRET)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runBackup()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Backup error:', error)
    return NextResponse.json({ error: 'Backup failed', details: String(error) }, { status: 500 })
  }
}

// Manual desde la app (solo admin autenticado)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runBackup()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Backup error:', error)
    return NextResponse.json({ error: 'Backup failed', details: String(error) }, { status: 500 })
  }
}
