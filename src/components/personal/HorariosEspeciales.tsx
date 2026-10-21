'use client'

/**
 * Personal → Horarios especiales: un horario distinto (o "no trabaja") para un
 * periodo, sin tocar el horario semanal. En esas fechas reemplaza al semanal
 * en la reserva online, el calendario y la carga de turnos (ver lib/horarios).
 * Cada tramo es una fila de horarios_especiales; un periodo con dos tramos
 * (dia cortado) son dos filas con las mismas fechas, dias y motivo.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { CalendarRange, Plus, Minus, Trash2, Loader2 } from 'lucide-react'
import { COLUMNAS_ESPECIALES, type HorarioEspecial } from '@/lib/horarios'

const DIAS = [
  { label: 'Lun', valor: 1 }, { label: 'Mar', valor: 2 }, { label: 'Mié', valor: 3 }, { label: 'Jue', valor: 4 },
  { label: 'Vie', valor: 5 }, { label: 'Sáb', valor: 6 }, { label: 'Dom', valor: 0 },
]

const HORAS: string[] = []
for (let h = 8; h <= 21; h++) for (const m of [0, 15, 30, 45]) {
  if (h === 21 && m > 0) break
  HORAS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
}

const hoyYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

interface Periodo {
  clave: string
  fecha_desde: string
  fecha_hasta: string
  dias_semana: number[] | null
  motivo: string | null
  filas: HorarioEspecial[]
}

/** Agrupa las filas (una por tramo) en periodos. */
function agrupar(filas: HorarioEspecial[]): Periodo[] {
  const m = new Map<string, Periodo>()
  for (const f of filas) {
    const dias = f.dias_semana && f.dias_semana.length ? [...f.dias_semana].sort() : null
    const clave = `${f.fecha_desde}|${f.fecha_hasta}|${dias?.join(',') ?? '*'}|${f.motivo ?? ''}`
    if (!m.has(clave)) m.set(clave, { clave, fecha_desde: f.fecha_desde, fecha_hasta: f.fecha_hasta, dias_semana: dias, motivo: f.motivo ?? null, filas: [] })
    m.get(clave)!.filas.push(f)
  }
  return [...m.values()].sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde))
}

function textoDias(dias: number[] | null): string {
  if (!dias || dias.length === 0 || dias.length === 7) return 'todos los días'
  return DIAS.filter(d => dias.includes(d.valor)).map(d => d.label).join(', ')
}

export function HorariosEspeciales({ profesionalId, profesionalNombre }: { profesionalId: string; profesionalNombre: string }) {
  const supabase = createClient()
  const [filas, setFilas] = useState<HorarioEspecial[]>([])
  const [cargando, setCargando] = useState(true)
  const [sinTabla, setSinTabla] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Formulario
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [dias, setDias] = useState<number[]>(DIAS.map(d => d.valor))
  const [noTrabaja, setNoTrabaja] = useState(false)
  const [tramos, setTramos] = useState([{ inicio: '10:00', fin: '19:00' }])
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('horarios_especiales').select(COLUMNAS_ESPECIALES)
      .eq('profesional_id', profesionalId).gte('fecha_hasta', hoyYMD()).order('fecha_desde')
    setSinTabla(Boolean(error))
    setFilas((data || []) as HorarioEspecial[])
    setCargando(false)
  }, [profesionalId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar() }, [cargar])

  function resetForm() {
    setDesde(''); setHasta(''); setDias(DIAS.map(d => d.valor)); setNoTrabaja(false)
    setTramos([{ inicio: '10:00', fin: '19:00' }]); setMotivo('')
  }

  async function guardar() {
    if (!desde || !hasta) { toast.error('Elegí desde y hasta'); return }
    if (hasta < desde) { toast.error('"Hasta" no puede ser antes que "desde"'); return }
    if (dias.length === 0) { toast.error('Elegí al menos un día'); return }
    if (!noTrabaja && tramos.some(t => t.fin <= t.inicio)) { toast.error('Cada horario tiene que terminar después de empezar'); return }
    setGuardando(true)
    try {
      const base = {
        profesional_id: profesionalId,
        fecha_desde: desde,
        fecha_hasta: hasta,
        dias_semana: dias.length === 7 ? null : dias,
        motivo: motivo.trim() || null,
      }
      const rows = noTrabaja
        ? [{ ...base, hora_inicio: null, hora_fin: null }]
        : tramos.map(t => ({ ...base, hora_inicio: t.inicio, hora_fin: t.fin }))
      const { error } = await supabase.from('horarios_especiales').insert(rows)
      if (error) { toast.error('No se pudo guardar: ' + error.message); return }
      toast.success('Horario especial guardado')
      resetForm(); setAbierto(false); cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(p: Periodo) {
    if (!confirm(`¿Borrar el horario especial del ${ddmm(p.fecha_desde)} al ${ddmm(p.fecha_hasta)}? Esos días vuelve al horario semanal.`)) return
    const { error } = await supabase.from('horarios_especiales').delete().in('id', p.filas.map(f => f.id!))
    if (error) { toast.error('No se pudo borrar'); return }
    toast.success('Horario especial borrado'); cargar()
  }

  const periodos = agrupar(filas)

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarRange className="h-5 w-5" />
              Horarios especiales
              <span className="text-sm font-normal text-muted-foreground">— {profesionalNombre}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Un horario distinto para un período (vacaciones, fiestas, un cambio temporal). Esos días reemplaza al horario semanal, sin modificarlo.
            </p>
          </div>
          {!abierto && !sinTabla && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAbierto(true)}>
              <Plus className="h-4 w-4" /> Agregar período
            </Button>
          )}
        </div>

        {sinTabla && (
          <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Falta crear la tabla de horarios especiales en la base (migración 00048). Hasta entonces se usa solo el horario semanal.
          </p>
        )}

        {/* Formulario */}
        {abierto && (
          <div className="rounded-md border-l-2 border-primary bg-muted/40 p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Desde</label>
                <Input type="date" value={desde} min={hoyYMD()} onChange={e => { setDesde(e.target.value); if (!hasta || hasta < e.target.value) setHasta(e.target.value) }} className="h-8 w-40 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Hasta</label>
                <Input type="date" value={hasta} min={desde || hoyYMD()} onChange={e => setHasta(e.target.value)} className="h-8 w-40 text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Qué días del período</label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(d => {
                  const on = dias.includes(d.valor)
                  return (
                    <button key={d.valor} type="button"
                      onClick={() => setDias(prev => on ? prev.filter(x => x !== d.valor) : [...prev, d.valor])}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setNoTrabaja(false)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${!noTrabaja ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>
                  Otro horario
                </button>
                <button type="button" onClick={() => setNoTrabaja(true)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${noTrabaja ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>
                  No trabaja
                </button>
              </div>
              {!noTrabaja && (
                <div className="space-y-1.5">
                  {tramos.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={t.inicio} onValueChange={v => setTramos(prev => prev.map((x, j) => j === i ? { ...x, inicio: v } : x))}>
                        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{HORAS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">a</span>
                      <Select value={t.fin} onValueChange={v => setTramos(prev => prev.map((x, j) => j === i ? { ...x, fin: v } : x))}>
                        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{HORAS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                      {tramos.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTramos(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar tramo">
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                    onClick={() => setTramos(prev => [...prev, { inicio: prev[prev.length - 1]?.fin || '14:00', fin: '19:00' }])}>
                    <Plus className="h-3 w-3" /> Agregar tramo (día cortado)
                  </Button>
                </div>
              )}
            </div>

            <Input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={120}
              placeholder="Motivo (opcional): ej. vacaciones, horario de diciembre" className="h-8 text-xs" />

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { resetForm(); setAbierto(false) }}>Cancelar</Button>
              <Button size="sm" onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        )}

        {/* Listado */}
        {cargando ? (
          <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : periodos.length === 0 ? (
          !sinTabla && <p className="text-sm text-muted-foreground">No hay horarios especiales vigentes ni próximos.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {periodos.map(p => {
              const libre = p.filas.every(f => !f.hora_inicio)
              const vigente = p.fecha_desde <= hoyYMD()
              return (
                <div key={p.clave} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium">
                      {p.fecha_desde === p.fecha_hasta ? ddmm(p.fecha_desde) : `${ddmm(p.fecha_desde)} al ${ddmm(p.fecha_hasta)}`}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{textoDias(p.dias_semana)}</span>
                      {vigente && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">vigente</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {libre ? 'No trabaja' : p.filas.filter(f => f.hora_inicio).sort((a, b) => a.hora_inicio!.localeCompare(b.hora_inicio!)).map(f => `${hhmm(f.hora_inicio)} a ${hhmm(f.hora_fin)}`).join(' y ')}
                      {p.motivo && <> · {p.motivo}</>}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => borrar(p)} aria-label="Borrar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
