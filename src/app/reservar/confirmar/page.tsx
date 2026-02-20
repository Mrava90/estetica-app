'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora, formatPrecio } from '@/lib/dates'
import type { Servicio, Profesional } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CalendarDays, User, Scissors, Banknote, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

function ConfirmarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const servicioId = searchParams.get('servicio')
  const profesionalId = searchParams.get('profesional')
  const fechaInicio = searchParams.get('inicio')
  const fechaFin = searchParams.get('fin')

  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [profesional, setProfesional] = useState<Profesional | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!servicioId || !profesionalId || !fechaInicio || !fechaFin) {
      router.push('/reservar')
      return
    }
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [servRes, profRes] = await Promise.all([
      supabase.from('servicios').select('*').eq('id', servicioId).single(),
      supabase.from('profesionales').select('*').eq('id', profesionalId).single(),
    ])
    if (servRes.data) setServicio(servRes.data)
    if (profRes.data) setProfesional(profRes.data)
  }

  async function handleConfirm() {
    if (!nombre.trim() || !telefono.trim()) {
      toast.error('Completá nombre y teléfono')
      return
    }
    if (telefono.length < 8) {
      toast.error('El teléfono debe tener al menos 8 dígitos')
      return
    }

    setLoading(true)
    try {
      // Find or create client
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefono', telefono)
        .single()

      let clienteId: string

      if (existingCliente) {
        clienteId = existingCliente.id
      } else {
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({ nombre, telefono })
          .select('id')
          .single()
        if (clienteError || !newCliente) throw clienteError
        clienteId = newCliente.id
      }

      // Create appointment
      const { error: citaError } = await supabase.from('citas').insert({
        cliente_id: clienteId,
        profesional_id: profesionalId,
        servicio_id: servicioId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        precio_cobrado: servicio?.precio_efectivo || null,
        origen: 'online',
        status: 'pendiente',
      })

      if (citaError) throw citaError

      router.push(`/reservar/exito?fecha=${fechaInicio}`)
    } catch {
      toast.error('Error al confirmar la cita. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (!servicio || !profesional || !fechaInicio) {
    return <div className="text-center text-muted-foreground py-12">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Confirmar turno</h1>
        <p className="text-muted-foreground">Revisá los datos y completá tu información</p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen del turno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Scissors className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{servicio.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {servicio.duracion_minutos} min — Efectivo: {formatPrecio(servicio.precio_efectivo)} | Tarjeta: {formatPrecio(servicio.precio_tarjeta)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{profesional.nombre}</p>
          </div>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{formatFechaHora(fechaInicio)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Client info form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input
              placeholder="Tu nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Teléfono (WhatsApp)</Label>
            <Input
              placeholder="Ej: 5491112345678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usaremos este número para confirmar tu turno por WhatsApp
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleConfirm}
        disabled={loading || !nombre.trim() || !telefono.trim()}
        size="lg"
        className="w-full"
      >
        {loading ? 'Confirmando...' : 'Confirmar turno'}
      </Button>
    </div>
  )
}

export default function ConfirmarPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground py-12">Cargando...</div>}>
      <ConfirmarContent />
    </Suspense>
  )
}
