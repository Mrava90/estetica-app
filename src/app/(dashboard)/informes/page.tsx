'use client'

import { useEffect, useState, useMemo } from 'react'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import {
  calcularCitasPorHora,
  calcularCitasPorDiaSemana,
  calcularCitasPorSemana,
  calcularIngresosPorDia,
  calcularServicioStats,
  calcularProfesionalStats,
  calcularResumen,
} from '@/lib/informes-utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  CalendarDays,
  DollarSign,
  TrendingUp,
  UserX,
  CalendarIcon,
} from 'lucide-react'

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.5rem',
  fontSize: '12px',
}

export default function InformesPage() {
  const [rangoFecha, setRangoFecha] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })
  const [filtroProfesional, setFiltroProfesional] = useState('todos')
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [rangoFecha]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const [citasRes, profRes] = await Promise.all([
      supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .gte('fecha_inicio', rangoFecha.from.toISOString())
        .lte('fecha_inicio', rangoFecha.to.toISOString())
        .neq('status', 'cancelada')
        .order('fecha_inicio'),
      supabase.from('profesionales').select('*').eq('activo', true).order('nombre'),
    ])
    if (citasRes.data) setCitas(citasRes.data)
    if (profRes.data) setProfesionales(profRes.data)
    setLoading(false)
  }

  const filteredCitas = useMemo(() => {
    if (filtroProfesional === 'todos') return citas
    return citas.filter((c) => c.profesional_id === filtroProfesional)
  }, [citas, filtroProfesional])

  const resumen = useMemo(() => calcularResumen(filteredCitas), [filteredCitas])
  const citasPorHora = useMemo(() => calcularCitasPorHora(filteredCitas), [filteredCitas])
  const citasPorDia = useMemo(() => calcularCitasPorDiaSemana(filteredCitas), [filteredCitas])
  const citasPorSemana = useMemo(() => calcularCitasPorSemana(filteredCitas), [filteredCitas])
  const ingresosPorDia = useMemo(() => calcularIngresosPorDia(filteredCitas), [filteredCitas])
  const servicioStats = useMemo(() => calcularServicioStats(filteredCitas), [filteredCitas])
  const profesionalStats = useMemo(() => calcularProfesionalStats(filteredCitas), [filteredCitas])

  const minHora = useMemo(() => {
    const withData = citasPorHora.filter((h) => h.horaNum >= 9 && h.horaNum <= 19)
    if (withData.length === 0) return null
    const minVal = Math.min(...withData.map((h) => h.total))
    return { value: minVal, horas: withData.filter((h) => h.total === minVal).map((h) => h.hora) }
  }, [citasPorHora])

  const minSemana = useMemo(() => {
    if (citasPorSemana.length === 0) return null
    const minVal = Math.min(...citasPorSemana.map((s) => s.total))
    return { value: minVal, semanas: citasPorSemana.filter((s) => s.total === minVal).map((s) => s.semana) }
  }, [citasPorSemana])

  const metodoPagoData = useMemo(
    () => [
      { name: 'Efectivo', value: resumen.efectivo },
      { name: 'Tarjeta', value: resumen.tarjeta },
    ],
    [resumen]
  )

  function setPreset(preset: 'este_mes' | 'mes_anterior' | 'ultimos_3') {
    const now = new Date()
    switch (preset) {
      case 'este_mes':
        setRangoFecha({ from: startOfMonth(now), to: endOfMonth(now) })
        break
      case 'mes_anterior':
        setRangoFecha({ from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) })
        break
      case 'ultimos_3':
        setRangoFecha({ from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) })
        break
    }
  }

  const rangoLabel = `${format(rangoFecha.from, 'dd/MM', { locale: es })} - ${format(rangoFecha.to, 'dd/MM/yy', { locale: es })}`

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Informes</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset('este_mes')}
        >
          Este mes
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset('mes_anterior')}
        >
          Mes anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset('ultimos_3')}
        >
          3 meses
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {rangoLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: rangoFecha.from, to: rangoFecha.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  setRangoFecha({ from: range.from, to: range.to })
                  setCalendarOpen(false)
                }
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        <Select value={filtroProfesional} onValueChange={setFiltroProfesional}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="Profesional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {profesionales.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Cargando datos...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total citas</CardTitle>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumen.totalCitas}</div>
                <p className="text-xs text-muted-foreground">
                  {resumen.completadas} completadas, {resumen.noAsistio} no asistieron
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Facturación</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrecio(resumen.ingresos)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatPrecio(resumen.efectivo)} efectivo / {formatPrecio(resumen.tarjeta)} tarjeta
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ticket promedio</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrecio(resumen.ticketPromedio)}</div>
                <p className="text-xs text-muted-foreground">por cita completada</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">No asistieron</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {resumen.totalCitas > 0
                    ? `${Math.round((resumen.noAsistio / resumen.totalCitas) * 100)}%`
                    : '0%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {resumen.noAsistio} de {resumen.totalCitas} citas
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="demanda">
            <TabsList>
              <TabsTrigger value="demanda">Demanda</TabsTrigger>
              <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
              <TabsTrigger value="servicios">Servicios</TabsTrigger>
              <TabsTrigger value="equipo">Equipo</TabsTrigger>
            </TabsList>

            {/* TAB: Demanda */}
            <TabsContent value="demanda" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Citas por hora */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Citas por hora del día</CardTitle>
                    <CardDescription>
                      Identificá las horas con menor demanda
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={citasPorHora}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="hora" className="text-xs" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="total" name="Citas" radius={[4, 4, 0, 0]}>
                          {citasPorHora.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={
                                minHora && entry.total === minHora.value && entry.horaNum >= 9 && entry.horaNum <= 19
                                  ? 'hsl(var(--destructive))'
                                  : CHART_COLORS[0]
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {minHora && (
                      <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                        <p className="font-medium">Horas con menor demanda:</p>
                        <p className="text-muted-foreground">
                          {minHora.horas.join(', ')} ({minHora.value} citas)
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Citas por semana del mes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Citas por semana del mes</CardTitle>
                    <CardDescription>
                      Distribución de la demanda a lo largo del mes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={citasPorSemana}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="semana" className="text-xs" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="total" name="Citas" radius={[4, 4, 0, 0]}>
                          {citasPorSemana.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={
                                minSemana && entry.total === minSemana.value
                                  ? 'hsl(var(--destructive))'
                                  : CHART_COLORS[1]
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {minSemana && (
                      <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                        <p className="font-medium">Semana con menor demanda:</p>
                        <p className="text-muted-foreground">
                          {minSemana.semanas.join(', ')} ({minSemana.value} citas)
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Citas por dia de la semana */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Citas por día de la semana</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={citasPorDia}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="dia" className="text-xs" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="total" name="Citas" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB: Ingresos */}
            <TabsContent value="ingresos" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Facturación por día</CardTitle>
                    <CardDescription>Efectivo vs Tarjeta</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ingresosPorDia.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={ingresosPorDia}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="fecha" className="text-xs" tick={{ fontSize: 10 }} />
                          <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(value) => formatPrecio(Number(value))}
                          />
                          <Legend />
                          <Bar dataKey="efectivo" name="Efectivo" stackId="a" fill={CHART_COLORS[3]} radius={[0, 0, 0, 0]} />
                          <Bar dataKey="tarjeta" name="Tarjeta" stackId="a" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        No hay datos de facturación en este período
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Método de pago</CardTitle>
                    <CardDescription>Proporción efectivo / tarjeta</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {resumen.ingresos > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={metodoPagoData}
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill={CHART_COLORS[3]} />
                            <Cell fill={CHART_COLORS[1]} />
                          </Pie>
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(value) => formatPrecio(Number(value))}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        Sin datos
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB: Servicios */}
            <TabsContent value="servicios" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Servicios más populares</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {servicioStats.length > 0 ? (
                      <ResponsiveContainer width="100%" height={Math.max(200, servicioStats.length * 40)}>
                        <BarChart data={servicioStats} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <YAxis type="category" dataKey="nombre" width={130} className="text-xs" tick={{ fontSize: 11 }} />
                          <XAxis type="number" allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="cantidad" name="Citas" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">Sin datos</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Detalle por servicio</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Servicio</TableHead>
                          <TableHead className="text-right">Citas</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {servicioStats.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                              Sin datos
                            </TableCell>
                          </TableRow>
                        )}
                        {servicioStats.map((s) => (
                          <TableRow key={s.nombre}>
                            <TableCell className="font-medium">{s.nombre}</TableCell>
                            <TableCell className="text-right">{s.cantidad}</TableCell>
                            <TableCell className="text-right">{formatPrecio(s.ingresos)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB: Equipo */}
            <TabsContent value="equipo" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Citas por profesional</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profesionalStats.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={profesionalStats}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="nombre" className="text-xs" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Legend />
                          <Bar dataKey="completadas" name="Completadas" fill={CHART_COLORS[1]} radius={[0, 0, 0, 0]} />
                          <Bar dataKey="noAsistio" name="No asistió" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">Sin datos</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rendimiento del equipo</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Profesional</TableHead>
                          <TableHead className="text-right">Citas</TableHead>
                          <TableHead className="text-right">No asistió</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profesionalStats.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              Sin datos
                            </TableCell>
                          </TableRow>
                        )}
                        {profesionalStats.map((p) => (
                          <TableRow key={p.nombre}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-full"
                                  style={{ backgroundColor: p.color }}
                                />
                                <span className="font-medium">{p.nombre}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{p.totalCitas}</TableCell>
                            <TableCell className="text-right">{p.noAsistio}</TableCell>
                            <TableCell className="text-right">{formatPrecio(p.ingresos)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
