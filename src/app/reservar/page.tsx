'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Banknote, Smartphone } from 'lucide-react'

export default function ReservarPage() {
  const router = useRouter()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedServicio, setSelectedServicio] = useState<string | null>(null)
  const [selectedProfesional, setSelectedProfesional] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const [servRes, profRes] = await Promise.all([
        supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
        supabase.from('profesionales').select('*').eq('activo', true).order('nombre'),
      ])
      if (servRes.data) setServicios(servRes.data)
      if (profRes.data) setProfesionales(profRes.data)
    }
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleContinue() {
    if (!selectedServicio) return
    const params = new URLSearchParams({ servicio: selectedServicio })
    if (selectedProfesional) params.set('profesional', selectedProfesional)
    router.push(`/reservar/horario?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reservar turno</h1>
        <p className="text-muted-foreground">Elegí el servicio y profesional</p>
      </div>

      {/* Service selection */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Servicio</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {servicios.map((s) => (
            <Card
              key={s.id}
              className={`cursor-pointer transition-all ${
                selectedServicio === s.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
              }`}
              onClick={() => setSelectedServicio(s.id)}
            >
              <CardContent className="p-4">
                <h3 className="font-medium">{s.nombre}</h3>
                {s.descripcion && <p className="text-sm text-muted-foreground mt-1">{s.descripcion}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {s.duracion_minutos} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    {formatPrecio(s.precio_efectivo)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    {formatPrecio(s.precio_mercadopago)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Professional selection */}
      {selectedServicio && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Profesional (opcional)</h2>
          <div className="flex flex-wrap gap-3">
            <Card
              className={`cursor-pointer transition-all ${
                !selectedProfesional ? 'ring-2 ring-primary' : 'hover:shadow-md'
              }`}
              onClick={() => setSelectedProfesional(null)}
            >
              <CardContent className="p-4">
                <p className="font-medium">Sin preferencia</p>
              </CardContent>
            </Card>
            {profesionales.map((p) => (
              <Card
                key={p.id}
                className={`cursor-pointer transition-all ${
                  selectedProfesional === p.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedProfesional(p.id)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full" style={{ backgroundColor: p.color }} />
                  <p className="font-medium">{p.nombre}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!selectedServicio}
        size="lg"
        className="w-full"
      >
        Continuar
      </Button>
    </div>
  )
}
