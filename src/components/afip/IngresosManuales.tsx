'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Coins } from 'lucide-react'
import { formatPrecio } from '@/lib/dates'

interface Movimiento {
  id: string
  fecha: string
  monto: number
  nota: string | null
  created_at: string
}

interface Props {
  onChange?: () => void
}

export function IngresosManuales({ onChange }: Props) {
  const [items, setItems] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/afip/manual')
      const data = await res.json()
      if (res.ok) setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function handleAdd() {
    const m = Number(monto.replace(/[.,]/g, '.'))
    if (!fecha || isNaN(m) || m <= 0) {
      toast.error('Fecha y monto válido son requeridos')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/afip/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, monto: m, nota }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al agregar')
        return
      }
      toast.success('Ingreso agregado')
      setMonto('')
      setNota('')
      fetchData()
      onChange?.()
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este ingreso manual?')) return
    const res = await fetch(`/api/afip/manual?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Eliminado')
      fetchData()
      onChange?.()
    } else {
      toast.error('Error al eliminar')
    }
  }

  const total = items.reduce((acc, i) => acc + Number(i.monto), 0)

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Coins className="h-4 w-4" />
            Ingresos manuales (no facturados a AFIP)
          </div>
          {items.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-semibold tabular-nums text-foreground">{formatPrecio(total)}</span>
            </div>
          )}
        </div>

        {/* Form alta */}
        <div className="flex flex-wrap gap-2 items-end pt-1 pb-2 border-b">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">Fecha</label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">Monto</label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="h-9 w-32 text-right tabular-nums"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-[10px] text-muted-foreground uppercase">Detalle (opcional)</label>
            <Input
              placeholder="Ej: ventas efectivo enero"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="h-9"
              maxLength={200}
            />
          </div>
          <Button onClick={handleAdd} disabled={adding} size="sm" className="h-9 gap-1.5">
            <Plus className="h-4 w-4" />
            {adding ? '...' : 'Agregar'}
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center italic">
            Sin ingresos manuales. Usá esto para sumar ventas no facturadas al cálculo.
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {items.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                <div className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
                  {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </div>
                <div className="flex-1 min-w-0 truncate text-xs">{m.nota || <span className="text-muted-foreground italic">sin detalle</span>}</div>
                <div className="font-semibold tabular-nums text-right">{formatPrecio(Number(m.monto))}</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
