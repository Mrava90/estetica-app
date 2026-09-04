'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profesional } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Wallet, Copy, Check } from 'lucide-react'

interface Props {
  profesional: Profesional
  onUpdate?: (newValue: string | null) => void
}

export function AliasPago({ profesional, onUpdate }: Props) {
  const supabase = createClient()
  const [valor, setValor] = useState(profesional.alias_pago || '')
  const [inicial, setInicial] = useState(profesional.alias_pago || '')
  const [saving, setSaving] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    setValor(profesional.alias_pago || '')
    setInicial(profesional.alias_pago || '')
  }, [profesional.id, profesional.alias_pago])

  const dirty = valor.trim() !== inicial.trim()

  async function guardar() {
    setSaving(true)
    const nuevo = valor.trim() || null
    const { error } = await supabase
      .from('profesionales')
      .update({ alias_pago: nuevo, updated_at: new Date().toISOString() })
      .eq('id', profesional.id)
    setSaving(false)
    if (error) {
      toast.error('Error al guardar')
      return
    }
    setInicial(nuevo || '')
    onUpdate?.(nuevo)
    toast.success(nuevo ? 'Alias guardado' : 'Alias eliminado')
  }

  async function copiar() {
    if (!inicial) return
    try {
      await navigator.clipboard.writeText(inicial)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" />
            Alias / CBU / CVU para pagos
          </Label>
          <p className="text-xs text-muted-foreground">
            Donde transferirle los pagos a {profesional.nombre}. Podés poner alias de MercadoPago, CBU, CVU o cualquier referencia útil.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="ej: nombre.apellido.mp"
            className="flex-1"
            maxLength={200}
          />
          {inicial && !dirty && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copiar}
              title="Copiar al portapapeles"
            >
              {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          )}
          {dirty && (
            <Button onClick={guardar} disabled={saving} size="sm">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
