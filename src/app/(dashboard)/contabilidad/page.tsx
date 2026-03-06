'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdminEmail } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Calculator, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'decimal', maximumFractionDigits: 0 }).format(n)
}

// ── Types ──────────────────────────────────────────────────────

interface CitaRow {
  fecha_inicio: string
  precio_cobrado: number | null
  comision_profesional: number | null
  profesional_id: string | null
  metodo_pago: string | null
  notas: string | null
  origen: string | null
}

function parseComisionNotas(notas: string | null): number {
  if (!notas) return 0
  const idx = notas.indexOf(' | com:')
  if (idx === -1) return 0
  return parseInt(notas.slice(idx + 7), 10) || 0
}

interface MovRow {
  fecha: string
  monto: number
  descripcion: string
  tipo: string
}

interface ProfRow {
  id: string
  nombre: string
  color: string
  sueldo_fijo: number | null
}

interface SueldoHistRow {
  profesional_id: string
  monto: number
  vigente_desde: string
}

// ── Main Component ─────────────────────────────────────────────

export default function ContabilidadPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()) // 0-indexed
  const [gastoFilter, setGastoFilter] = useState<'todos' | 'local' | 'adelanto' | 'personal'>('todos')
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [citas, setCitas] = useState<CitaRow[]>([])
  const [movimientos, setMovimientos] = useState<MovRow[]>([])
  const [profesionales, setProfesionales] = useState<ProfRow[]>([])
  const [sueldosHistorico, setSueldosHistorico] = useState<SueldoHistRow[]>([])

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthorized(isAdminEmail(data.user?.email))
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Citas del año
    const citasRes = await supabase
      .from('citas')
      .select('fecha_inicio, precio_cobrado, profesional_id, metodo_pago, notas, origen')
      .eq('status', 'completada')
      .gte('fecha_inicio', `${year}-01-01`)
      .lt('fecha_inicio', `${year + 1}-01-01`)

    const citasData: CitaRow[] = (citasRes.data || []).map(c => ({
      ...c,
      comision_profesional: parseComisionNotas(c.notas),
    }))

    const [movsRes, profsRes, sueldosRes] = await Promise.all([
      supabase
        .from('movimientos_caja')
        .select('fecha, monto, descripcion, tipo')
        .gte('fecha', `${year}-01-01`)
        .lte('fecha', `${year}-12-31`)
        .order('fecha'),
      supabase
        .from('profesionales')
        .select('id, nombre, color, sueldo_fijo')
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('sueldos_fijos_historico')
        .select('profesional_id, monto, vigente_desde')
        .lte('vigente_desde', `${year}-12-31`)
        .order('vigente_desde', { ascending: true }),
    ])

    setCitas(citasData)
    if (movsRes.data) setMovimientos(movsRes.data)
    if (profsRes.data) setProfesionales(profsRes.data)
    // sueldos_fijos_historico puede no existir aún — ignorar error
    if (sueldosRes.data) setSueldosHistorico(sueldosRes.data)
    setLoading(false)
  }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authorized) fetchData()
  }, [authorized, fetchData])

  // ── Helper: sueldo vigente de un profesional para un mes ──────
  // monthStr: 'YYYY-MM'
  const getSueldoProf = useCallback((profId: string, monthStr: string): number => {
    const monthDate = `${monthStr}-01`
    const profHistory = sueldosHistorico.filter(s => s.profesional_id === profId)
    if (profHistory.length > 0) {
      // Hay historial → usar solo el historial (no fallback a sueldo_fijo)
      // Así los meses anteriores al primer registro quedan en $0
      const applicable = profHistory.filter(s => s.vigente_desde <= monthDate)
      return applicable.length > 0 ? applicable[applicable.length - 1].monto : 0
    }
    // Sin historial → fallback a sueldo_fijo (compatibilidad con datos anteriores)
    const prof = profesionales.find(p => p.id === profId)
    return prof?.sueldo_fijo || 0
  }, [sueldosHistorico, profesionales])

  // ── TAB 1: Resumen Anual ───────────────────────────────────────

  const monthData = useMemo(() => {
    return MESES.map((mes, i) => {
      const monthNum = i + 1
      const monthStr = `${year}-${String(monthNum).padStart(2, '0')}`
      const nextMonth = monthNum === 12 ? 1 : monthNum + 1
      const nextYear = monthNum === 12 ? year + 1 : year

      const monthCitas = citas.filter(c => c.fecha_inicio.slice(0, 7) === monthStr && c.origen === 'sheets')
      const monthMovs = movimientos.filter(m => m.fecha.slice(0, 7) === monthStr)

      // Ingresos
      const ventasBrutas = monthCitas.reduce((sum, c) => sum + (c.precio_cobrado || 0), 0)
      // Comisiones de citas (parseadas de notas)
      const comisiones = monthCitas.reduce((sum, c) => sum + (c.comision_profesional || 0), 0)
      // Sueldos fijos del mes
      const sueldosFijos = profesionales.reduce((sum, p) => sum + getSueldoProf(p.id, monthStr), 0)
      // Gastos del local (montos negativos en DB)
      const gastosLocalRaw = monthMovs
        .filter(m => m.descripcion.startsWith('Gasto local:'))
        .reduce((sum, m) => sum + m.monto, 0)

      // resultado = ventas - comisiones - sueldos + gastosLocalRaw
      // (gastosLocalRaw es negativo, así que suma resta)
      const resultado = ventasBrutas - comisiones - sueldosFijos + gastosLocalRaw
      const margen = ventasBrutas > 0 ? (resultado / ventasBrutas) * 100 : 0

      return {
        mes,
        monthStr,
        inicio: `01/${String(monthNum).padStart(2, '0')}/${year}`,
        fin: `01/${String(nextMonth).padStart(2, '0')}/${nextYear}`,
        ventasBrutas,
        comisiones,
        sueldosFijos,
        gastosLocal: Math.abs(gastosLocalRaw), // positivo para mostrar
        resultado,
        margen,
      }
    })
  }, [citas, movimientos, year, profesionales, getSueldoProf])

  const totals = useMemo(() => {
    const t = { ventasBrutas: 0, comisiones: 0, sueldosFijos: 0, gastosLocal: 0, resultado: 0 }
    for (const m of monthData) {
      t.ventasBrutas += m.ventasBrutas
      t.comisiones += m.comisiones
      t.sueldosFijos += m.sueldosFijos
      t.gastosLocal += m.gastosLocal
      t.resultado += m.resultado
    }
    return { ...t, margen: t.ventasBrutas > 0 ? (t.resultado / t.ventasBrutas) * 100 : 0 }
  }, [monthData])

  // ── TAB 2: Caja Diaria del mes ────────────────────────────────

  const cajaDiariaData = useMemo(() => {
    const monthStr = `${year}-${String(selectedMonth + 1).padStart(2, '0')}`
    const monthCitas = citas.filter(c => c.fecha_inicio.slice(0, 7) === monthStr && c.origen === 'sheets')
    const monthMovs = movimientos.filter(m => m.fecha.slice(0, 7) === monthStr)

    interface DayData {
      ingresosEf: number; ingresosMp: number
      egresosEf: number;  egresosMp: number
      creditosEf: number; creditosMp: number
    }
    const byDay: Record<string, DayData> = {}
    const empty = (): DayData => ({ ingresosEf: 0, ingresosMp: 0, egresosEf: 0, egresosMp: 0, creditosEf: 0, creditosMp: 0 })

    for (const c of monthCitas) {
      const day = c.fecha_inicio.slice(0, 10)
      if (!byDay[day]) byDay[day] = empty()
      if (c.metodo_pago === 'mercadopago' || c.metodo_pago === 'transferencia') {
        byDay[day].ingresosMp += c.precio_cobrado || 0
      } else {
        byDay[day].ingresosEf += c.precio_cobrado || 0
      }
    }

    for (const m of monthMovs) {
      if (m.descripcion.startsWith('Comisión:')) continue
      if (!byDay[m.fecha]) byDay[m.fecha] = empty()
      if (m.monto < 0) {
        if (m.tipo === 'mercadopago') byDay[m.fecha].egresosMp += Math.abs(m.monto)
        else byDay[m.fecha].egresosEf += Math.abs(m.monto)
      } else {
        if (m.tipo === 'mercadopago') byDay[m.fecha].creditosMp += m.monto
        else byDay[m.fecha].creditosEf += m.monto
      }
    }

    const sorted = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
    return sorted.map(([fecha, d]) => {
      const netoEf = d.ingresosEf - d.egresosEf + d.creditosEf
      const netoMp = d.ingresosMp - d.egresosMp + d.creditosMp
      // movimiento neto de gastos/créditos por tipo (negativo = gasto, positivo = crédito)
      const movEf = d.creditosEf - d.egresosEf
      const movMp = d.creditosMp - d.egresosMp
      return {
        fecha: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`,
        netoEf,
        netoMp,
        movEf,
        movMp,
        resultado: netoEf + netoMp,
      }
    })
  }, [citas, movimientos, year, selectedMonth])

  // ── TAB 3: Liquidación Mensual ────────────────────────────────

  const liquidacionData = useMemo(() => {
    const monthStr = `${year}-${String(selectedMonth + 1).padStart(2, '0')}`
    const monthCitas = citas.filter(c => c.fecha_inicio.slice(0, 7) === monthStr)
    const monthMovs = movimientos.filter(m => m.fecha.slice(0, 7) === monthStr)

    return profesionales.map(prof => {
      const profCitas = monthCitas.filter(c => c.profesional_id === prof.id && c.origen === 'sheets')
      const ventasCitas = profCitas.reduce((sum, c) => sum + (c.precio_cobrado || 0), 0)
      const comisiones = profCitas.reduce((sum, c) => sum + (c.comision_profesional || 0), 0)
      const sueldoFijo = getSueldoProf(prof.id, monthStr)

      // Adelantos: movimientos "Adelanto comisión:" que mencionen al profesional
      const adelantos = monthMovs
        .filter(m => {
          if (!m.descripcion.startsWith('Adelanto comisión:')) return false
          const desc = m.descripcion.toLowerCase()
          const nombre = prof.nombre.toLowerCase()
          return desc.includes(nombre) || desc.includes(nombre.slice(0, 4))
        })
        .reduce((sum, m) => sum + Math.abs(m.monto), 0)

      const esSueldoFijo = sueldoFijo > 0
      // Para sueldo fijo sin citas: mostrar sueldo_fijo en columna ventas
      const ventas = esSueldoFijo && ventasCitas === 0 ? sueldoFijo : ventasCitas
      // Falta pagar: sueldo fijo vs adelantos / comisiones vs adelantos
      const faltaPagar = esSueldoFijo
        ? Math.max(0, sueldoFijo - adelantos)
        : Math.max(0, comisiones - adelantos)

      return { prof, ventas, comisiones, sueldoFijo, adelantos, faltaPagar, esSueldoFijo }
    }).filter(r => r.ventas > 0 || r.comisiones > 0 || r.adelantos > 0)
  }, [citas, movimientos, profesionales, year, selectedMonth, getSueldoProf])

  // ── TAB 4: Gastos ─────────────────────────────────────────────

  // Todos los gastos del mes (sin filtro de categoría) — para los totales en las tarjetas
  const gastosDelMes = useMemo(() => {
    const monthStr = `${year}-${String(selectedMonth + 1).padStart(2, '0')}`
    return movimientos.filter(m => {
      if (m.monto >= 0) return false
      if (m.fecha.slice(0, 7) !== monthStr) return false
      return (
        m.descripcion.startsWith('Gasto local:') ||
        m.descripcion.startsWith('Adelanto comisión:') ||
        m.descripcion.startsWith('Gasto personal:')
      )
    })
  }, [movimientos, year, selectedMonth])

  // Gastos filtrados por categoría — para la tabla de detalle
  const gastosData = useMemo(() => {
    return gastosDelMes
      .filter(m => {
        if (gastoFilter === 'local') return m.descripcion.startsWith('Gasto local:')
        if (gastoFilter === 'adelanto') return m.descripcion.startsWith('Adelanto comisión:')
        if (gastoFilter === 'personal') return m.descripcion.startsWith('Gasto personal:')
        return true // 'todos'
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [gastosDelMes, gastoFilter])

  // Totales por categoría siempre calculados sobre el mes completo (sin filtro)
  const gastosPorCategoria = useMemo(() => {
    const local = gastosDelMes
      .filter(m => m.descripcion.startsWith('Gasto local:'))
      .reduce((s, m) => s + Math.abs(m.monto), 0)
    const adelanto = gastosDelMes
      .filter(m => m.descripcion.startsWith('Adelanto comisión:'))
      .reduce((s, m) => s + Math.abs(m.monto), 0)
    const personal = gastosDelMes
      .filter(m => m.descripcion.startsWith('Gasto personal:'))
      .reduce((s, m) => s + Math.abs(m.monto), 0)
    return { local, adelanto, personal, total: local + adelanto + personal }
  }, [gastosDelMes])

  // ── Render ────────────────────────────────────────────────────

  if (authorized === null) return null
  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Acceso denegado</p>
      </div>
    )
  }

  function YearSelector() {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setYear(prev => prev - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => setYear(prev => prev + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  function MonthSelector() {
    return (
      <div className="flex items-center gap-2">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <YearSelector />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>

      <Tabs defaultValue="resumen">
        <TabsList variant="line">
          <TabsTrigger value="resumen">Resumen Anual</TabsTrigger>
          <TabsTrigger value="caja">Caja Diaria</TabsTrigger>
          <TabsTrigger value="liquidacion">Liquidación</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB 1: RESUMEN ANUAL ═══════ */}
        <TabsContent value="resumen" className="space-y-4 mt-4">
          <div className="flex justify-end"><YearSelector /></div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                <CardTitle className="text-sm font-medium">Sueldos Fijos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">-${formatMoney(totals.sueldosFijos)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gastos Local</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">-${formatMoney(totals.gastosLocal)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resultado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totals.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  ${formatMoney(totals.resultado)}
                </div>
                <p className="text-xs text-muted-foreground">Margen: {totals.margen.toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardHeader><CardTitle>Detalle mensual {year}</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mes</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Comisiones</TableHead>
                        <TableHead className="text-right">Sueldos</TableHead>
                        <TableHead className="text-right">Gastos local</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthData.map(m => {
                        const hasData = m.ventasBrutas > 0 || m.gastosLocal > 0
                        return (
                          <TableRow key={m.mes} className={!hasData ? 'text-muted-foreground' : ''}>
                            <TableCell className="font-medium">{m.mes}</TableCell>
                            <TableCell className="text-right">${formatMoney(m.ventasBrutas)}</TableCell>
                            <TableCell className="text-right text-red-500">-${formatMoney(m.comisiones)}</TableCell>
                            <TableCell className="text-right text-red-500">-${formatMoney(m.sueldosFijos)}</TableCell>
                            <TableCell className="text-right text-red-500">-${formatMoney(m.gastosLocal)}</TableCell>
                            <TableCell className={`text-right font-semibold ${m.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ${formatMoney(m.resultado)}
                            </TableCell>
                            <TableCell className="text-right">
                              {m.ventasBrutas > 0 ? `${m.margen.toFixed(1)}%` : '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      <TableRow className="border-t-2 bg-muted/50 font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">${formatMoney(totals.ventasBrutas)}</TableCell>
                        <TableCell className="text-right text-red-500">-${formatMoney(totals.comisiones)}</TableCell>
                        <TableCell className="text-right text-red-500">-${formatMoney(totals.sueldosFijos)}</TableCell>
                        <TableCell className="text-right text-red-500">-${formatMoney(totals.gastosLocal)}</TableCell>
                        <TableCell className={`text-right font-bold ${totals.resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          ${formatMoney(totals.resultado)}
                        </TableCell>
                        <TableCell className="text-right">{totals.margen.toFixed(1)}%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════ TAB 2: CAJA DIARIA ═══════ */}
        <TabsContent value="caja" className="space-y-4 mt-4">
          <div className="flex justify-end"><MonthSelector /></div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Caja Diaria — {MESES[selectedMonth]} {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Día</TableHead>
                        <TableHead className="text-right">Efectivo</TableHead>
                        <TableHead className="text-right">MercadoPago</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cajaDiariaData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Sin datos para este mes
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {cajaDiariaData.map(d => (
                            <TableRow key={d.fecha}>
                              <TableCell className="font-medium">{d.fecha}</TableCell>
                              <TableCell className="text-right">
                                <div className={d.netoEf < 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                                  {d.netoEf !== 0 ? `$${formatMoney(d.netoEf)}` : '—'}
                                </div>
                                {d.movEf !== 0 && (
                                  <div className={`text-[10px] ${d.movEf < 0 ? 'text-red-400' : 'text-green-500'}`}>
                                    {d.movEf < 0 ? `-$${formatMoney(Math.abs(d.movEf))}` : `+$${formatMoney(d.movEf)}`}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className={d.netoMp < 0 ? 'text-red-500 font-medium' : 'text-blue-600 font-medium'}>
                                  {d.netoMp !== 0 ? `$${formatMoney(d.netoMp)}` : '—'}
                                </div>
                                {d.movMp !== 0 && (
                                  <div className={`text-[10px] ${d.movMp < 0 ? 'text-red-400' : 'text-green-500'}`}>
                                    {d.movMp < 0 ? `-$${formatMoney(Math.abs(d.movMp))}` : `+$${formatMoney(d.movMp)}`}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className={`text-right font-semibold ${d.resultado < 0 ? 'text-red-500' : ''}`}>
                                {d.resultado !== 0 ? `$${formatMoney(d.resultado)}` : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 bg-muted/50 font-bold">
                            <TableCell>TOTAL</TableCell>
                            <TableCell className="text-right text-green-600">
                              ${formatMoney(cajaDiariaData.reduce((s, d) => s + d.netoEf, 0))}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              ${formatMoney(cajaDiariaData.reduce((s, d) => s + d.netoMp, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              ${formatMoney(cajaDiariaData.reduce((s, d) => s + d.resultado, 0))}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════ TAB 3: LIQUIDACIÓN ═══════ */}
        <TabsContent value="liquidacion" className="space-y-4 mt-4">
          <div className="flex justify-end"><MonthSelector /></div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Liquidación — {MESES[selectedMonth]} {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profesional</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">A cobrar</TableHead>
                        <TableHead className="text-right">Adelantos</TableHead>
                        <TableHead className="text-right">Falta pagar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liquidacionData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Sin datos para este mes
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {liquidacionData.map(r => (
                            <TableRow key={r.prof.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-3 w-3 rounded-full inline-block flex-shrink-0"
                                    style={{ backgroundColor: r.prof.color }}
                                  />
                                  <span className="font-medium">{r.prof.nombre}</span>
                                  {r.esSueldoFijo && (
                                    <Badge variant="secondary" className="text-xs">Fijo</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">${formatMoney(r.ventas)}</TableCell>
                              <TableCell className="text-right">
                                {r.esSueldoFijo
                                  ? <span className="text-muted-foreground">—</span>
                                  : `$${formatMoney(r.comisiones)}`}
                              </TableCell>
                              <TableCell className="text-right text-orange-500">
                                {r.adelantos > 0 ? `-$${formatMoney(r.adelantos)}` : '—'}
                              </TableCell>
                              <TableCell className={`text-right font-semibold ${r.faltaPagar > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                ${formatMoney(r.faltaPagar)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 bg-muted/50 font-bold">
                            <TableCell>TOTAL</TableCell>
                            <TableCell className="text-right">
                              ${formatMoney(liquidacionData.reduce((s, r) => s + r.ventas, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              ${formatMoney(liquidacionData.reduce((s, r) => s + r.comisiones, 0))}
                            </TableCell>
                            <TableCell className="text-right text-orange-500">
                              -${formatMoney(liquidacionData.reduce((s, r) => s + r.adelantos, 0))}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              ${formatMoney(liquidacionData.reduce((s, r) => s + r.faltaPagar, 0))}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════ TAB 4: GASTOS ═══════ */}
        <TabsContent value="gastos" className="space-y-4 mt-4">
          <div className="flex justify-end"><MonthSelector /></div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Resumen por categoría */}
              <div className="grid gap-2 grid-cols-4">
                {([
                  { label: 'Local', value: gastosPorCategoria.local, color: 'text-red-500' },
                  { label: 'Adelantos', value: gastosPorCategoria.adelanto, color: 'text-orange-500' },
                  { label: 'Personal', value: gastosPorCategoria.personal, color: 'text-red-500' },
                  { label: 'Total', value: gastosPorCategoria.total, color: 'text-red-600' },
                ]).map(cat => (
                  <div
                    key={cat.label}
                    className="text-left rounded-lg border border-border px-3 py-2"
                  >
                    <div className="text-xs text-muted-foreground mb-0.5">{cat.label}</div>
                    <div className={`text-base font-bold ${cat.color}`}>-${formatMoney(cat.value)}</div>
                  </div>
                ))}
              </div>

              {/* Filtros de categoría */}
              <div className="flex gap-1">
                {([
                  { label: 'Todos', value: 'todos' },
                  { label: 'Local', value: 'local' },
                  { label: 'Adelantos', value: 'adelanto' },
                  { label: 'Personal', value: 'personal' },
                ] as const).map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setGastoFilter(f.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                      gastoFilter === f.value
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {gastoFilter === 'todos' ? 'Todos los gastos' :
                   gastoFilter === 'local' ? 'Gastos del local' :
                   gastoFilter === 'adelanto' ? 'Adelantos' : 'Gastos personales'}
                  {' — '}{MESES[selectedMonth]} {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Medio</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gastosData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Sin gastos registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        gastosData.map((m, i) => {
                          let cat = ''
                          let desc = m.descripcion
                          if (m.descripcion.startsWith('Gasto local:')) {
                            cat = 'Local'
                            desc = m.descripcion.replace('Gasto local:', '').trim()
                          } else if (m.descripcion.startsWith('Adelanto comisión:')) {
                            cat = 'Adelanto'
                            desc = m.descripcion.replace('Adelanto comisión:', '').trim()
                          } else if (m.descripcion.startsWith('Gasto personal:')) {
                            cat = 'Personal'
                            desc = m.descripcion.replace('Gasto personal:', '').trim()
                          }
                          const fecha = `${m.fecha.slice(8, 10)}/${m.fecha.slice(5, 7)}/${m.fecha.slice(0, 4)}`
                          return (
                            <TableRow key={`${m.fecha}-${i}`}>
                              <TableCell className="text-sm">{fecha}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={cat === 'Local' ? 'default' : cat === 'Adelanto' ? 'secondary' : 'outline'}
                                  className="text-xs"
                                >
                                  {cat}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{desc}</TableCell>
                              <TableCell className="text-sm text-muted-foreground capitalize">{m.tipo}</TableCell>
                              <TableCell className="text-right text-red-500 font-medium">
                                -${formatMoney(Math.abs(m.monto))}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
