'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profesional } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Clock4 } from 'lucide-react'

interface Props {
  profesional: Profesional
  onUpdate?: (newValue: number) => void
}

const OPCIONES = [10, 15, 20] as const

export function ToleranciaSolapamiento({ profesional, onUpdate }: Props) {
  const supabase = createClient()
  const [valor, setValor] = useState(profesional.tolerancia_solapamiento_min || 0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValor(profesional.tolerancia_solapamiento_min || 0)
  }, [profesional.id, profesional.tolerancia_solapamiento_min])

  async function guardar(nuevoValor: number) {
    setSaving(true)
    const prev = valor
    setValor(nuevoValor)
    const { error } = await supabase
      .from('profesionales')
      .update({ tolerancia_solapamiento_min: nuevoValor, updated_at: new Date().toISOString() })
      .eq('id', profesional.id)
    setSaving(false)
    if (error) {
      setValor(prev)
      toast.error('Error al guardar')
      return
    }
    onUpdate?.(nuevoValor)
    toast.success(nuevoValor === 0 ? 'Sin tolerancia' : `Tolerancia ${nuevoValor} min`)
  }

  const activo = valor > 0

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <Label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <Clock4 className="h-4 w-4" />
              Permitir superposición de turnos
            </Label>
            <p className="text-xs text-muted-foreground">
              Cuando el horario está casi cubierto, deja que el cliente reserve aunque el servicio se pise
              hasta esta cantidad de minutos con el turno siguiente. {profesional.nombre} se encarga del overlap.
            </p>
          </div>
          <Switch
            checked={activo}
            disabled={saving}
            onCheckedChange={(checked) => guardar(checked ? 15 : 0)}
            aria-label="Activar superposición"
          />
        </div>

        {activo && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Máximo:</span>
            <div className="flex gap-1.5">
              {OPCIONES.map((n) => (
                <button
                  key={n}
                  onClick={() => guardar(n)}
                  disabled={saving}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    valor === n
                      ? 'border-fuchsia-500 bg-fuchsia-500 text-white'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {n} min
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
