import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { backupCalendarioToSheets } from '@/lib/sheets-backup'
import { isAdminEmail } from '@/lib/constants'

async function runBackup() {
  const supabase = createAdminClient()
  return backupCalendarioToSheets(supabase)
}

// Cron automático (llamado por Vercel con CRON_SECRET)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runBackup()
    return NextResponse.json({
      ok: true,
      citasBackedUp: result.citasBackedUp,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Backup calendario error:', error)
    return NextResponse.json(
      { error: 'Backup failed', details: String(error) },
      { status: 500 }
    )
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
    return NextResponse.json({
      ok: true,
      citasBackedUp: result.citasBackedUp,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Backup calendario error:', error)
    return NextResponse.json(
      { error: 'Backup failed', details: String(error) },
      { status: 500 }
    )
  }
}
