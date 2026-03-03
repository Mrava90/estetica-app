import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { backupCalendarioToSheets } from '@/lib/sheets-backup'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const result = await backupCalendarioToSheets(supabase)

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
