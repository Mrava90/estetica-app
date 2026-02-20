'use client'

import type { Profesional } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  profesionales: Profesional[]
  activos: string[]
  onChange: (ids: string[]) => void
}

export function FiltrosProfesional({ profesionales, activos, onChange }: Props) {
  function toggleProfesional(id: string) {
    if (activos.includes(id)) {
      onChange(activos.filter((a) => a !== id))
    } else {
      onChange([...activos, id])
    }
  }

  function toggleAll() {
    if (activos.length === profesionales.length) {
      onChange([])
    } else {
      onChange(profesionales.map((p) => p.id))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={toggleAll}
        className={cn(
          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
          activos.length === profesionales.length
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:bg-muted'
        )}
      >
        Todos
      </button>
      {profesionales.map((prof) => (
        <button
          key={prof.id}
          onClick={() => toggleProfesional(prof.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            activos.includes(prof.id)
              ? 'border-transparent text-white'
              : 'border-border bg-card text-muted-foreground hover:bg-muted'
          )}
          style={
            activos.includes(prof.id)
              ? { backgroundColor: prof.color }
              : undefined
          }
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: prof.color }}
          />
          {prof.nombre}
        </button>
      ))}
    </div>
  )
}
