'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Configuracion } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Configuracion | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchConfig() {
    const { data } = await supabase.from('configuracion').select('*').single()
    if (data) setConfig(data)
  }

  async function handleSave() {
    if (!config) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('configuracion')
        .update({
          nombre_salon: config.nombre_salon,
          telefono: config.telefono,
          direccion: config.direccion,
          zona_horaria: config.zona_horaria,
          intervalo_citas_minutos: config.intervalo_citas_minutos,
          dias_anticipacion_reserva: config.dias_anticipacion_reserva,
          mensaje_confirmacion: config.mensaje_confirmacion,
          mensaje_recordatorio: config.mensaje_recordatorio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
      if (error) throw error
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  function copyBookingLink() {
    const url = `${window.location.origin}/reservar`
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Enlace copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!config) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      {/* Booking link */}
      <Card>
        <CardHeader>
          <CardTitle>Enlace de reserva online</CardTitle>
          <CardDescription>Compartí este enlace con tus clientes para que reserven online</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/reservar`} readOnly />
            <Button variant="outline" onClick={copyBookingLink} className="gap-2 shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle>Datos del salón</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre del salón</Label>
              <Input
                value={config.nombre_salon}
                onChange={(e) => setConfig({ ...config, nombre_salon: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={config.telefono || ''}
                onChange={(e) => setConfig({ ...config, telefono: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input
              value={config.direccion || ''}
              onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Zona horaria</Label>
              <Input
                value={config.zona_horaria}
                onChange={(e) => setConfig({ ...config, zona_horaria: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Intervalo de citas (min)</Label>
              <Input
                type="number"
                value={config.intervalo_citas_minutos}
                onChange={(e) => setConfig({ ...config, intervalo_citas_minutos: parseInt(e.target.value) || 30 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Días de anticipación</Label>
              <Input
                type="number"
                value={config.dias_anticipacion_reserva}
                onChange={(e) => setConfig({ ...config, dias_anticipacion_reserva: parseInt(e.target.value) || 30 })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message templates */}
      <Card>
        <CardHeader>
          <CardTitle>Plantillas de mensajes WhatsApp</CardTitle>
          <CardDescription>
            Variables disponibles: {'{cliente}'}, {'{servicio}'}, {'{profesional}'}, {'{fecha}'}, {'{hora}'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mensaje de confirmación</Label>
            <Textarea
              rows={3}
              value={config.mensaje_confirmacion || ''}
              onChange={(e) => setConfig({ ...config, mensaje_confirmacion: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Mensaje de recordatorio (24h antes)</Label>
            <Textarea
              rows={3}
              value={config.mensaje_recordatorio || ''}
              onChange={(e) => setConfig({ ...config, mensaje_recordatorio: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} size="lg">
        {loading ? 'Guardando...' : 'Guardar configuración'}
      </Button>
    </div>
  )
}
