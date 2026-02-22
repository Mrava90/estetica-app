import { NextRequest, NextResponse } from 'next/server'
import { fetchSheetData } from '@/lib/sheets-sync'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'Missing GOOGLE_SPREADSHEET_ID' }, { status: 500 })
  }

  try {
    const sheet = request.nextUrl.searchParams.get('sheet') || 'Gastos'
    const rows = await fetchSheetData(spreadsheetId, sheet)

    // Show first 20 rows with column indices
    const preview = rows.slice(0, 20).map((row, i) => ({
      rowIndex: i,
      cells: row.map((cell, j) => ({ col: j, value: cell })),
      rawLength: row.length,
    }))

    return NextResponse.json({
      sheet,
      totalRows: rows.length,
      preview,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
