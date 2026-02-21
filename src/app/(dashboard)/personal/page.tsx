'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profesional, Horario } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Plus, Minus, Copy, Save } from 'lucide-react'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIAS_MAP = [1, 2, 3, 4, 5, 6, 0] // Lun=1 ... Dom=0

// Generate time options every 30 min from 08:00 to 21:00
const TIME_OPTIONS: string[] = []
for (let h = 8; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface DaySchedule {
  enabled: boolean
  blocks: { inicio: string; fin: string }[]
}

type WeekSchedule = DaySchedule[]

function emptyWeek(): WeekSchedule {
  return DIAS.map(() => ({ enabled: false, blocks: [] }))
}

function horariosToWeek(horarios: Horario[]): WeekSchedule {
  const week = emptyWeek()
  for (const h of horarios) {
    const idx = DIAS_MAP.indexOf(h.dia_semana)
    if (idx >= 0) {
      week[idx].enabled = true
      week[idx].blocks.push({ inicio: h.hora_inicio.slice(0, 5), fin: h.hora_fin.slice(0, 5) })
    }
  }
  // Sort blocks by start time
  for (const day of week) {
    day.blocks.sort((a, b) => a.inicio.localeCompare(b.inicio))
  }
  return week
}

export default function PersonalPage() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedProf, setSelectedProf] = useState<string | null>(null)
  const [week, setWeek] = useState<WeekSchedule>(emptyWeek())
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
      if (data && data.length > 0) {
        setProfesionales(data)
        setSelectedProf(data[0].id)
      }
    }
    fetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedProf) fetchHorarios(selectedProf)
  }, [selectedProf]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchHorarios(profId: string) {
    const { data } = await supabase
      .from('horarios')
      .select('*')
      .eq('profesional_id', profId)
      .eq('activo', true)
      .order('dia_semana')
    setWeek(data ? horariosToWeek(data) : emptyWeek())
    setHasChanges(false)
  }

  function updateWeek(fn: (w: WeekSchedule) => WeekSchedule) {
    setWeek((prev) => fn([...prev.map((d) => ({ ...d, blocks: [...d.blocks.map((b) => ({ ...b }))] }))]))
    setHasChanges(true)
  }

  function toggleDay(idx: number) {
    updateWeek((w) => {
      w[idx].enabled = !w[idx].enabled
      if (w[idx].enabled && w[idx].blocks.length === 0) {
        w[idx].blocks = [{ inicio: '10:00', fin: '19:00' }]
      }
      return w
    })
  }

  function addBlock(dayIdx: number) {
    updateWeek((w) => {
      const lastBlock = w[dayIdx].blocks[w[dayIdx].blocks.length - 1]
      const newStart = lastBlock ? lastBlock.fin : '10:00'
      const startIdx = TIME_OPTIONS.indexOf(newStart)
      const newEnd = startIdx >= 0 && startIdx + 2 < TIME_OPTIONS.length
        ? TIME_OPTIONS[startIdx + 2]
        : '19:00'
      w[dayIdx].blocks.push({ inicio: newStart, fin: newEnd })
      return w
    })
  }

  function removeBlock(dayIdx: number, blockIdx: number) {
    updateWeek((w) => {
      w[dayIdx].blocks.splice(blockIdx, 1)
      if (w[dayIdx].blocks.length === 0) w[dayIdx].enabled = false
      return w
    })
  }

  function setBlockTime(dayIdx: number, blockIdx: number, field: 'inicio' | 'fin', value: string) {
    updateWeek((w) => {
      w[dayIdx].blocks[blockIdx][field] = value
      return w
    })
  }

  function replicateDay(fromIdx: number) {
    updateWeek((w) => {
      const source = w[fromIdx]
      for (let i = 0; i < w.length; i++) {
        if (i !== fromIdx) {
          w[i].enabled = source.enabled
          w[i].blocks = source.blocks.map((b) => ({ ...b }))
        }
      }
      return w
    })
  }

  async function handleSave() {
    if (!selectedProf) return
    setSaving(true)
    try {
      // Delete existing horarios
      await supabase.from('horarios').delete().eq('profesional_id', selectedProf)

      // Insert new ones
      const rows: { profesional_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; activo: boolean }[] = []
      for (let i = 0; i < week.length; i++) {
        if (week[i].enabled) {
          for (const block of week[i].blocks) {
            rows.push({
              profesional_id: selectedProf,
              dia_semana: DIAS_MAP[i],
              hora_inicio: block.inicio,
              hora_fin: block.fin,
              activo: true,
            })
          }
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('horarios').insert(rows)
        if (error) throw error
      }

      toast.success('Horarios guardados')
      setHasChanges(false)
    } catch {
      toast.error('Error al guardar horarios')
    } finally {
      setSaving(false)
    }
  }

  const prof = profesionales.find((p) => p.id === selectedProf)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personal</h1>
        <Button onClick={handleSave} disabled={saving || !hasChanges} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar horarios'}
        </Button>
      </div>

      {/* Professional selector */}
      <div className="flex flex-wrap gap-2">
        {profesionales.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProf(p.id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selectedProf === p.id
                ? 'border-transparent text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
            style={selectedProf === p.id ? { backgroundColor: p.color } : undefined}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.nombre}
          </button>
        ))}
      </div>

      {prof && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-4">
              Días y horarios de atención
              <span className="ml-2 text-sm font-normal text-muted-foreground">— {prof.nombre}</span>
            </h2>

            {/* Schedule grid */}
            <div className="grid grid-cols-7 gap-2 sm:gap-3">
              {DIAS.map((dia, dayIdx) => (
                <div key={dia} className="space-y-2">
                  {/* Day header + checkbox */}
                  <div className="flex flex-col items-center gap-1">
                    <Checkbox
                      checked={week[dayIdx].enabled}
                      onCheckedChange={() => toggleDay(dayIdx)}
                    />
                    <span className={`text-xs font-semibold ${week[dayIdx].enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {dia}
                    </span>
                  </div>

                  {/* Time blocks */}
                  {week[dayIdx].enabled ? (
                    <div className="space-y-2">
                      {week[dayIdx].blocks.map((block, blockIdx) => (
                        <div key={blockIdx} className="space-y-1">
                          <Select
                            value={block.inicio}
                            onValueChange={(v) => setBlockTime(dayIdx, blockIdx, 'inicio', v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_OPTIONS.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={block.fin}
                            onValueChange={(v) => setBlockTime(dayIdx, blockIdx, 'fin', v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_OPTIONS.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {week[dayIdx].blocks.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-6 text-xs text-destructive hover:text-destructive"
                              onClick={() => removeBlock(dayIdx, blockIdx)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => addBlock(dayIdx)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs gap-1"
                        onClick={() => replicateDay(dayIdx)}
                      >
                        <Copy className="h-3 w-3" />
                        Replicar
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-xs text-muted-foreground italic">Libre</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
