'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones } from '@/types/database'
import { formatHora, formatPrecio } from '@/lib/dates'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarDays, Users, DollarSign, Clock } from 'lucide-react'

interface Stats {
  citasHoy: number
  citasSemana: number
  clientesNuevos: number
  facturacionMes: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ citasHoy: 0, citasSemana: 0, clientesNuevos: 0, facturacionMes: 0 })
  const [citasHoy, setCitasHoy] = useState<CitaConRelaciones[]>([])
  const supabase = createClient()

  useEffect(() => {
    fetchStats()
    fetchCitasHoy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchStats() {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1)
    startOfWeek.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 7)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

    const [hoyRes, semanaRes, clientesRes, facturacionRes] = await Promise.all([
      supabase
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_inicio', startOfDay)
        .lt('fecha_inicio', endOfDay)
        .in('status', ['pendiente', 'confirmada', 'completada']),
      supabase
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_inicio', startOfWeek.toISOString())
        .lt('fecha_inicio', endOfWeek.toISOString())
        .in('status', ['pendiente', 'confirmada', 'completada']),
      supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonth),
      supabase
        .from('citas')
        .select('precio_cobrado')
        .gte('fecha_inicio', startOfMonth)
        .lt('fecha_inicio', endOfMonth)
        .eq('status', 'completada'),
    ])

    const facturacion = facturacionRes.data?.reduce((sum, c) => sum + (c.precio_cobrado || 0), 0) || 0

    setStats({
      citasHoy: hoyRes.count || 0,
      citasSemana: semanaRes.count || 0,
      clientesNuevos: clientesRes.count || 0,
      facturacionMes: facturacion,
    })
  }

  async function fetchCitasHoy() {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    const { data } = await supabase
      .from('citas')
      .select('*, clientes(*), profesionales(*), servicios(*)')
      .gte('fecha_inicio', startOfDay)
      .lt('fecha_inicio', endOfDay)
      .in('status', ['pendiente', 'confirmada'])
      .order('fecha_inicio')

    if (data) setCitasHoy(data)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Citas hoy</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.citasHoy}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Citas esta semana</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.citasSemana}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes nuevos (mes)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.clientesNuevos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Facturación (mes)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrecio(stats.facturacionMes)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Citas de hoy</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendario">Ver calendario</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {citasHoy.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No hay citas para hoy</p>
          ) : (
            <div className="space-y-3">
              {citasHoy.map((cita) => (
                <div key={cita.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: cita.profesionales?.color || '#6366f1' }}
                    >
                      {formatHora(cita.fecha_inicio)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{cita.clientes?.nombre || 'Sin cliente'}</p>
                      <p className="text-xs text-muted-foreground">
                        {cita.servicios?.nombre} con {cita.profesionales?.nombre}
                      </p>
                    </div>
                  </div>
                  <Badge className={STATUS_COLORS[cita.status]}>{STATUS_LABELS[cita.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
