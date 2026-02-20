'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { clienteSchema, type ClienteInput } from '@/lib/validators'
import type { Cliente, CitaConRelaciones } from '@/types/database'
import { formatFechaHora, formatPrecio } from '@/lib/dates'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Phone } from 'lucide-react'

export default function ClienteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
  })

  useEffect(() => {
    fetchCliente()
    fetchHistorial()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchCliente() {
    const { data } = await supabase.from('clientes').select('*').eq('id', params.id).single()
    if (data) {
      setCliente(data)
      reset({
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email || '',
        notas: data.notas || '',
      })
    }
  }

  async function fetchHistorial() {
    const { data } = await supabase
      .from('citas')
      .select('*, clientes(*), profesionales(*), servicios(*)')
      .eq('cliente_id', params.id)
      .order('fecha_inicio', { ascending: false })
      .limit(50)
    if (data) setCitas(data)
  }

  async function onSubmit(data: ClienteInput) {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ ...data, email: data.email || null, notas: data.notas || null, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (error) throw error
      toast.success('Cliente actualizado')
      fetchCliente()
    } catch {
      toast.error('Error al actualizar cliente')
    } finally {
      setLoading(false)
    }
  }

  if (!cliente) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{cliente.nombre}</h1>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Client info */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input {...register('nombre')} />
                {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...register('telefono')} type="tel" />
                {errors.telefono && <p className="text-sm text-destructive">{errors.telefono.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" {...register('email')} />
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea {...register('notas')} placeholder="Alergias, preferencias, etc." />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Service history */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Historial de servicios</CardTitle>
          </CardHeader>
          <CardContent>
            {citas.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Sin historial de citas</p>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {citas.map((cita) => (
                  <div key={cita.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 sm:p-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium truncate">{cita.servicios?.nombre || 'Servicio eliminado'}</p>
                      <p className="text-xs text-muted-foreground">
                        {cita.profesionales?.nombre || 'N/A'} · {formatFechaHora(cita.fecha_inicio)}
                      </p>
                      {cita.precio_cobrado && (
                        <p className="text-xs font-medium">{formatPrecio(cita.precio_cobrado)}</p>
                      )}
                    </div>
                    <Badge className={`shrink-0 text-[10px] sm:text-xs ${STATUS_COLORS[cita.status]}`}>{STATUS_LABELS[cita.status]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
