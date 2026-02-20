'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ADMIN_EMAIL } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calculator, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'decimal', maximumFractionDigits: 0 }).format(n)
}

interface MonthData {
  mes: string
  inicio: string
  fin: string
  ventasBrutas: number
  comisiones: number
  gastosLocal: number
  gastosPersonal: number
  resultado: number
  margen: number
}

export default function ContabilidadPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [citas, setCitas] = useState<{ fecha_inicio: string; precio_cobrado: number | null }[]>([])
  const [movimientos, setMovimientos] = useState<{ fecha: string; monto: number; descripcion: string }[]>([])

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthorized(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [citasRes, movsRes] = await Promise.all([
      supabase
        .from('citas')
        .select('fecha_inicio, precio_cobrado')
        .eq('status', 'completada')
        .gte('fecha_inicio', `${year}-01-01`)
        .lt('fecha_inicio', `${year + 1}-01-01`),
      supabase
        .from('movimientos_caja')
        .select('fecha, monto, descripcion')
        .gte('fecha', `${year}-01-01`)
        .lte('fecha', `${year}-12-31`),
    ])
    if (citasRes.data) setCitas(citasRes.data)
    if (movsRes.data) setMovimientos(movsRes.data)
    setLoading(false)
  }, [year])

  useEffect(() => {
    if (authorized) fetchData()
  }, [authorized, fetchData])

  const monthData = useMemo((): MonthData[] => {
    return MESES.map((mes, i) => {
      const monthNum = i + 1
      const monthStr = String(monthNum).padStart(2, '0')
      const nextMonth = monthNum === 12 ? 1 : monthNum + 1
      const nextYear = monthNum === 12 ? year + 1 : year
      const inicio = `${year}-${monthStr}-01`
      const fin = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      // Ventas brutas from citas
      const ventasBrutas = citas
        .filter((c) => {
          const d = c.fecha_inicio.slice(0, 7)
          return d === `${year}-${monthStr}`
        })
        .reduce((sum, c) => sum + (c.precio_cobrado || 0), 0)

      // Movimientos by category (already negative values)
      const monthMovs = movimientos.filter((m) => {
        const d = m.fecha.slice(0, 7)
        return d === `${year}-${monthStr}`
      })

      const comisiones = monthMovs
        .filter((m) => m.descripcion.startsWith('Adelanto comision:'))
        .reduce((sum, m) => sum + m.monto, 0)

      const gastosLocal = monthMovs
        .filter((m) => m.descripcion.startsWith('Gasto local:'))
        .reduce((sum, m) => sum + m.monto, 0)

      const gastosPersonal = monthMovs
        .filter((m) => m.descripcion.startsWith('Gasto personal:'))
        .reduce((sum, m) => sum + m.monto, 0)

      const resultado = ventasBrutas + comisiones + gastosLocal + gastosPersonal
      const margen = ventasBrutas > 0 ? (resultado / ventasBrutas) * 100 : 0

      return {
        mes,
        inicio: `${String(1).padStart(2, '0')}/${monthStr}/${year}`,
        fin: `${String(1).padStart(2, '0')}/${String(nextMonth).padStart(2, '0')}/${nextYear}`,
        ventasBrutas,
        comisiones: Math.abs(comisiones),
        gastosLocal: Math.abs(gastosLocal),
        gastosPersonal: Math.abs(gastosPersonal),
        resultado,
        margen,
      }
    })
  }, [citas, movimientos, year])

  const totals = useMemo(() => {
    const t = {
      ventasBrutas: 0,
      comisiones: 0,
      gastosLocal: 0,
      gastosPersonal: 0,
      resultado: 0,
      margen: 0,
    }
    for (const m of monthData) {
      t.ventasBrutas += m.ventasBrutas
      t.comisiones += m.comisiones
      t.gastosLocal += m.gastosLocal
      t.gastosPersonal += m.gastosPersonal
      t.resultado += m.resultado
    }
    t.margen = t.ventasBrutas > 0 ? (t.resultado / t.ventasBrutas) * 100 : 0
    return t
  }, [monthData])

  if (authorized === null) return null
  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Acceso denegado</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
          <p className="text-muted-foreground">Resumen anual financiero</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Brutas</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${formatMoney(totals.ventasBrutas)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">-${formatMoney(totals.comisiones)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">-${formatMoney(totals.gastosLocal + totals.gastosPersonal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resultado Final</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              ${formatMoney(totals.resultado)}
            </div>
            <p className="text-xs text-muted-foreground">Margen: {totals.margen.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen Mensual {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead className="text-right">Ventas Brutas</TableHead>
                    <TableHead className="text-right">Comisiones Prof.</TableHead>
                    <TableHead className="text-right">Gastos Local</TableHead>
                    <TableHead className="text-right">Gastos Personal</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Margen %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthData.map((m) => {
                    const hasData = m.ventasBrutas > 0 || m.comisiones > 0 || m.gastosLocal > 0 || m.gastosPersonal > 0
                    return (
                      <TableRow key={m.mes} className={!hasData ? 'text-muted-foreground' : ''}>
                        <TableCell className="font-medium">{m.mes}</TableCell>
                        <TableCell>{m.inicio}</TableCell>
                        <TableCell>{m.fin}</TableCell>
                        <TableCell className="text-right">${formatMoney(m.ventasBrutas)}</TableCell>
                        <TableCell className="text-right text-red-500">${formatMoney(m.comisiones)}</TableCell>
                        <TableCell className="text-right text-red-500">${formatMoney(m.gastosLocal)}</TableCell>
                        <TableCell className="text-right text-red-500">${formatMoney(m.gastosPersonal)}</TableCell>
                        <TableCell className={`text-right font-semibold ${m.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          ${formatMoney(m.resultado)}
                        </TableCell>
                        <TableCell className="text-right">{m.ventasBrutas > 0 ? `${m.margen.toFixed(1)}%` : '0.0%'}</TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Total row */}
                  <TableRow className="border-t-2 bg-muted/50 font-bold">
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right">${formatMoney(totals.ventasBrutas)}</TableCell>
                    <TableCell className="text-right text-red-500">${formatMoney(totals.comisiones)}</TableCell>
                    <TableCell className="text-right text-red-500">${formatMoney(totals.gastosLocal)}</TableCell>
                    <TableCell className="text-right text-red-500">${formatMoney(totals.gastosPersonal)}</TableCell>
                    <TableCell className={`text-right font-bold ${totals.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ${formatMoney(totals.resultado)}
                    </TableCell>
                    <TableCell className="text-right">{totals.margen.toFixed(1)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
