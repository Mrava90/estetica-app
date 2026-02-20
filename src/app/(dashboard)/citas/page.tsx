'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CitaConRelaciones, Profesional } from '@/types/database'
import { formatFechaHora, formatPrecio } from '@/lib/dates'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Phone } from 'lucide-react'

export default function CitasPage() {
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroProfesional, setFiltroProfesional] = useState('todos')
  const supabase = createClient()

  useEffect(() => {
    fetchProfesionales()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCitas()
  }, [filtroStatus, filtroProfesional]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
    if (data) setProfesionales(data)
  }

  async function fetchCitas() {
    let query = supabase
      .from('citas')
      .select('*, clientes(*), profesionales(*), servicios(*)')
      .order('fecha_inicio', { ascending: false })
      .limit(100)

    if (filtroStatus !== 'todos') {
      query = query.eq('status', filtroStatus)
    }
    if (filtroProfesional !== 'todos') {
      query = query.eq('profesional_id', filtroProfesional)
    }

    const { data } = await query
    if (data) setCitas(data)
  }

  function generarWhatsAppLink(cita: CitaConRelaciones) {
    if (!cita.clientes?.telefono) return
    const tel = cita.clientes.telefono.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Hola ${cita.clientes.nombre}, te recordamos tu cita para ${cita.servicios?.nombre || 'tu servicio'} el ${formatFechaHora(cita.fecha_inicio)}. ¡Te esperamos!`
    )
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Citas</h1>

      <div className="flex flex-wrap gap-3">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="confirmada">Confirmada</SelectItem>
            <SelectItem value="completada">Completada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="no_asistio">No asistió</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroProfesional} onValueChange={setFiltroProfesional}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Profesional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los profesionales</SelectItem>
            {profesionales.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha / Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">WhatsApp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {citas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No hay citas con los filtros seleccionados
                  </TableCell>
                </TableRow>
              )}
              {citas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{formatFechaHora(c.fecha_inicio)}</TableCell>
                  <TableCell className="font-medium">{c.clientes?.nombre || '-'}</TableCell>
                  <TableCell>{c.servicios?.nombre || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.profesionales?.color || '#ccc' }}
                      />
                      {c.profesionales?.nombre || '-'}
                    </div>
                  </TableCell>
                  <TableCell>{c.precio_cobrado ? formatPrecio(c.precio_cobrado) : '-'}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.clientes?.telefono && (
                      <Button variant="ghost" size="icon" onClick={() => generarWhatsAppLink(c)}>
                        <Phone className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
