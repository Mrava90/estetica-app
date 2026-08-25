'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Copy, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIAS_ORDEN, CATEGORIA_LABELS, getCategoria, type CategoriaServicio } from '@/lib/categorias'

interface Props {
  profesional: Profesional
  profesionales: Profesional[]
}

export function ServiciosProfesional({ profesional, profesionales }: Props) {
  const supabase = createClient()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [original, setOriginal] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [colapsadas, setColapsadas] = useState<Set<CategoriaServicio>>(new Set())
  const [copiarDe, setCopiarDe] = useState<string>('')

  // Fetch servicios + asignaciones del profesional
  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      const [servRes, asignRes] = await Promise.all([
        supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
        supabase.from('profesional_servicios').select('servicio_id').eq('profesional_id', profesional.id),
      ])
      if (cancelled) return
      setServicios(servRes.data || [])
      const ids = new Set((asignRes.data || []).map((a) => a.servicio_id))
      setSeleccionados(ids)
      setOriginal(new Set(ids))
      // Por default colapsar todas las categorías
      setColapsadas(new Set(CATEGORIAS_ORDEN))
      setLoading(false)
    }
    fetchData()
    return () => { cancelled = true }
  }, [profesional.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasChanges = useMemo(() => {
    if (seleccionados.size !== original.size) return true
    for (const id of seleccionados) if (!original.has(id)) return true
    return false
  }, [seleccionados, original])

  // Agrupar y filtrar
  const serviciosPorCategoria = useMemo(() => {
    const map: Record<CategoriaServicio, Servicio[]> = {
      manos: [], pies: [], pestanas: [], cejas: [], otros: [],
    }
    const term = busqueda.trim().toLowerCase()
    for (const s of servicios) {
      if (term && !s.nombre.toLowerCase().includes(term)) continue
      const cat = getCategoria(s.nombre, s.categoria)
      map[cat].push(s)
    }
    return map
  }, [servicios, busqueda])

  function toggleServicio(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCategoriaColapso(cat: CategoriaServicio) {
    setColapsadas((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function marcarTodosCategoria(cat: CategoriaServicio, value: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      for (const s of serviciosPorCategoria[cat]) {
        if (value) next.add(s.id)
        else next.delete(s.id)
      }
      return next
    })
  }

  async function handleCopiarDe(profId: string) {
    if (!profId) return
    const { data } = await supabase
      .from('profesional_servicios')
      .select('servicio_id')
      .eq('profesional_id', profId)
    if (data) {
      setSeleccionados(new Set(data.map((d) => d.servicio_id)))
      const profCopia = profesionales.find((p) => p.id === profId)
      toast.success(`Servicios copiados de ${profCopia?.nombre || 'otro'}`)
    }
    setCopiarDe('')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const aBorrar: string[] = []
      const aInsertar: string[] = []
      for (const id of original) if (!seleccionados.has(id)) aBorrar.push(id)
      for (const id of seleccionados) if (!original.has(id)) aInsertar.push(id)

      if (aBorrar.length > 0) {
        const { error } = await supabase
          .from('profesional_servicios')
          .delete()
          .eq('profesional_id', profesional.id)
          .in('servicio_id', aBorrar)
        if (error) throw error
      }
      if (aInsertar.length > 0) {
        const { error } = await supabase
          .from('profesional_servicios')
          .insert(aInsertar.map((sid) => ({ profesional_id: profesional.id, servicio_id: sid })))
        if (error) throw error
      }

      setOriginal(new Set(seleccionados))
      toast.success('Servicios actualizados')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const otrosProfes = profesionales.filter((p) => p.id !== profesional.id)
  const totalSeleccionados = seleccionados.size
  const totalServicios = servicios.length

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">
            Servicios que realiza
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              — {profesional.nombre} ({totalSeleccionados}/{totalServicios})
            </span>
          </h2>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            size="sm"
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar servicios'}
          </Button>
        </div>

        {/* Buscador + Copiar */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar servicio..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          {otrosProfes.length > 0 && (
            <Select value={copiarDe} onValueChange={handleCopiarDe}>
              <SelectTrigger className="h-9 w-auto gap-2">
                <Copy className="h-4 w-4" />
                <SelectValue placeholder="Copiar de..." />
              </SelectTrigger>
              <SelectContent>
                {otrosProfes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Cargando servicios...</p>
        ) : (
          <div className="space-y-2">
            {CATEGORIAS_ORDEN.map((cat) => {
              const items = serviciosPorCategoria[cat]
              if (items.length === 0) return null
              const seleccionadosCat = items.filter((s) => seleccionados.has(s.id)).length
              const isCollapsed = colapsadas.has(cat) && !busqueda.trim()
              const todosMarcados = items.every((s) => seleccionados.has(s.id))

              return (
                <div key={cat} className="rounded-lg border">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40">
                    <button
                      onClick={() => toggleCategoriaColapso(cat)}
                      className="flex items-center gap-2 flex-1 text-left text-sm font-medium hover:opacity-80"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span>{CATEGORIA_LABELS[cat]}</span>
                      <span className="text-xs text-muted-foreground">
                        ({seleccionadosCat}/{items.length})
                      </span>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => marcarTodosCategoria(cat, !todosMarcados)}
                      >
                        {todosMarcados ? 'Ninguno' : 'Todos'}
                      </Button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y">
                      {items.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <Checkbox
                            checked={seleccionados.has(s.id)}
                            onCheckedChange={() => toggleServicio(s.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{s.nombre}</p>
                            <p className="text-xs text-muted-foreground">{s.duracion_minutos} min</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {servicios.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay servicios cargados</p>
            )}
            {servicios.length > 0 && Object.values(serviciosPorCategoria).every((items) => items.length === 0) && busqueda && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin resultados para &quot;{busqueda}&quot;</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
