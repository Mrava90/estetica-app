import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncFromSheets } from '@/lib/sheets-sync'
import { isAdminEmail } from '@/lib/constants'

export async function POST() {
  // Verify user is authenticated and is admin
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const result = await syncFromSheets(supabase)

    return NextResponse.json({
      ok: true,
      synced: {
        citas: result.citasCount,
        movimientos: result.movimientosCount,
      },
      skipped: {
        citas: result.citasSkipped,
        movimientos: result.movimientosSkipped,
      },
      debug: result.debug,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Manual sheets sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
