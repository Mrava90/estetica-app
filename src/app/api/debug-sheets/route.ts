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
    const maxRows = parseInt(request.nextUrl.searchParams.get('rows') || '30', 10)
    const rows = await fetchSheetData(spreadsheetId, sheet)

    // Show rows with column indices
    const preview = rows.slice(0, maxRows).map((row, i) => {
      const cells: Record<string, string> = {}
      row.forEach((cell, j) => {
        if (cell && cell.trim()) cells[`col${j}`] = cell
      })
      return { row: i, ...cells }
    })

    // For Gastos, show the header rows to identify section columns
    let headers = null
    if (sheet === 'Gastos') {
      headers = {
        row0: rows[0]?.map((c, i) => ({ col: i, val: c })).filter(x => x.val),
        row1: rows[1]?.map((c, i) => ({ col: i, val: c })).filter(x => x.val),
        row2: rows[2]?.map((c, i) => ({ col: i, val: c })).filter(x => x.val),
      }
    }

    return NextResponse.json({
      sheet,
      totalRows: rows.length,
      maxColWidth: Math.max(...rows.map(r => r.length)),
      headers,
      preview,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
