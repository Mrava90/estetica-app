'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, addDays, subDays, startOfDay, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, MovimientoCaja } from '@/types/database'
import { formatPrecio, formatHora } from '@/lib/dates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Trash2,
  Banknote,
  Smartphone,
  Building2,
  Wallet,
} from 'lucide-react'

export default function CajaDiariaPage() {
  const [fecha, setFecha] = useState<Date>(new Date())
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // New movement form state
  const [newMonto, setNewMonto] = useState('')
  const [newTipo, setNewTipo] = useState<'efectivo' | 'mercadopago'>('efectivo')
  const [newDescripcion, setNewDescripcion] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const dayStart = startOfDay(fecha).toISOString()
    const dayEnd = startOfDay(addDays(fecha, 1)).toISOString()
    const fechaStr = format(fecha, 'yyyy-MM-dd')

    const [citasRes, movsRes] = await Promise.all([
      supabase
        .from('citas')
        .select('*, clientes(*), profesionales(*), servicios(*)')
        .gte('fecha_inicio', dayStart)
        .lt('fecha_inicio', dayEnd)
        .eq('status', 'completada')
        .order('fecha_inicio'),
      supabase
        .from('movimientos_caja')
        .select('*')
        .eq('fecha', fechaStr)
        .order('created_at'),
    ])

    if (citasRes.data) setCitas(citasRes.data)
    if (movsRes.data) setMovimientos(movsRes.data)
    setLoading(false)
  }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totals = useMemo(() => {
    let efectivoCitas = 0
    let mercadopagoCitas = 0

    for (const cita of citas) {
      const monto = cita.precio_cobrado || 0
      if (cita.metodo_pago === 'efectivo') {
        efectivoCitas += monto
      } else {
        mercadopagoCitas += monto
      }
    }

    let efectivoMovimientos = 0
    let mercadopagoMovimientos = 0

    for (const mov of movimientos) {
      if (mov.tipo === 'efectivo') {
        efectivoMovimientos += mov.monto
      } else {
        mercadopagoMovimientos += mov.monto
      }
    }

    return {
      efectivoCitas,
      mercadopagoCitas,
      efectivoMovimientos,
      mercadopagoMovimientos,
      totalEfectivo: efectivoCitas + efectivoMovimientos,
      totalMercadopago: mercadopagoCitas + mercadopagoMovimientos,
      grandTotal: efectivoCitas + mercadopagoCitas + efectivoMovimientos + mercadopagoMovimientos,
    }
  }, [citas, movimientos])

  async function handleAddMovimiento() {
    const monto = parseFloat(newMonto)
    if (!monto || monto === 0) {
      toast.error('El monto no puede ser 0')
      return
    }
    if (!newDescripcion.trim() || newDescripcion.trim().length < 2) {
      toast.error('Descripción requerida')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('movimientos_caja').insert({
      fecha: format(fecha, 'yyyy-MM-dd'),
      monto,
      tipo: newTipo,
      descripcion: newDescripcion.trim(),
    })

    if (error) {
      toast.error('Error al guardar movimiento')
    } else {
      toast.success('Movimiento agregado')
      setDialogOpen(false)
      setNewMonto('')
      setNewTipo('efectivo')
      setNewDescripcion('')
      fetchData()
    }
    setSaving(false)
  }

  async function handleDeleteMovimiento(id: string) {
    if (!confirm('¿Eliminar este movimiento?')) return
    const { error } = await supabase.from('movimientos_caja').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar')
    } else {
      toast.success('Movimiento eliminado')
      fetchData()
    }
  }

  function MetodoPagoBadge({ metodo }: { metodo: string }) {
    switch (metodo) {
      case 'mercadopago':
        return <Badge variant="outline" className="gap-1 text-xs"><Smartphone className="h-3 w-3" />MP</Badge>
      case 'transferencia':
        return <Badge variant="outline" className="gap-1 text-xs"><Building2 className="h-3 w-3" />Transf.</Badge>
      default:
        return <Badge variant="outline" className="gap-1 text-xs"><Banknote className="h-3 w-3" />Efectivo</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with date navigation */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caja Diaria</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setFecha(subDays(fecha, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 min-w-[200px]">
                <CalendarDays className="h-4 w-4" />
                {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={(d) => {
                  if (d) {
                    setFecha(d)
                    setCalendarOpen(false)
                  }
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => setFecha(addDays(fecha, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday(fecha) && (
            <Button variant="outline" size="sm" onClick={() => setFecha(new Date())}>
              Hoy
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Cargando...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Efectivo</CardTitle>
                <Banknote className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totals.totalEfectivo < 0 ? 'text-destructive' : ''}`}>
                  {formatPrecio(totals.totalEfectivo)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cobros: {formatPrecio(totals.efectivoCitas)}
                  {totals.efectivoMovimientos !== 0 && (
                    <> | Movs: {formatPrecio(totals.efectivoMovimientos)}</>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Mercadopago</CardTitle>
                <Smartphone className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totals.totalMercadopago < 0 ? 'text-destructive' : ''}`}>
                  {formatPrecio(totals.totalMercadopago)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cobros: {formatPrecio(totals.mercadopagoCitas)}
                  {totals.mercadopagoMovimientos !== 0 && (
                    <> | Movs: {formatPrecio(totals.mercadopagoMovimientos)}</>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totals.grandTotal < 0 ? 'text-destructive' : ''}`}>
                  {formatPrecio(totals.grandTotal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {citas.length} cobro{citas.length !== 1 ? 's' : ''} + {movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cobros del día */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobros del día</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {citas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Sin cobros este día
                      </TableCell>
                    </TableRow>
                  )}
                  {citas.map((cita) => (
                    <TableRow key={cita.id}>
                      <TableCell className="text-sm">{formatHora(cita.fecha_inicio)}</TableCell>
                      <TableCell className="text-sm font-medium">{cita.clientes?.nombre || '—'}</TableCell>
                      <TableCell className="text-sm">{cita.servicios?.nombre || '—'}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          {cita.profesionales && (
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cita.profesionales.color }} />
                          )}
                          {cita.profesionales?.nombre || '—'}
                        </div>
                      </TableCell>
                      <TableCell><MetodoPagoBadge metodo={cita.metodo_pago} /></TableCell>
                      <TableCell className="text-right font-medium">{formatPrecio(cita.precio_cobrado || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Movimientos manuales */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Movimientos manuales</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nuevo movimiento
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Sin movimientos manuales
                      </TableCell>
                    </TableRow>
                  )}
                  {movimientos.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium">{mov.descripcion}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 text-xs">
                          {mov.tipo === 'efectivo' ? (
                            <><Banknote className="h-3 w-3" />Efectivo</>
                          ) : (
                            <><Smartphone className="h-3 w-3" />Mercadopago</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${mov.monto < 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {mov.monto > 0 ? '+' : ''}{formatPrecio(mov.monto)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMovimiento(mov.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog para nuevo movimiento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Monto (negativo para retiros/gastos)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ej: -5000 para un retiro"
                value={newMonto}
                onChange={(e) => setNewMonto(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newTipo} onValueChange={(v) => setNewTipo(v as 'efectivo' | 'mercadopago')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="mercadopago">Mercadopago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                placeholder="Ej: Retiro de caja, Compra insumos..."
                value={newDescripcion}
                onChange={(e) => setNewDescripcion(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleAddMovimiento} disabled={saving}>
              {saving ? 'Guardando...' : 'Agregar movimiento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
