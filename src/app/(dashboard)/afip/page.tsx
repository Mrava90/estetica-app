'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, Building2, ScrollText, Pencil } from 'lucide-react'
import { formatPrecio } from '@/lib/dates'
import { CATEGORIAS_SERVICIOS, getCategoria, getProximaCategoria, calcularRiesgo, calcularFaltante, proximaRecategorizacion } from '@/lib/monotributo'
import { IngresosManuales } from '@/components/afip/IngresosManuales'

interface Snapshot {
  cuit: string
  estado_clave: string | null
  tipo_persona: string | null
  razon_social: string | null
  nombre: string | null
  apellido: string | null
  categoria_monotributo: string | null
  consultado_at: string
  impuestos: Array<{ id: number; descripcion: string; estado: string; periodo: string | null }> | null
  actividades: Array<{ id: string; descripcion: string }> | null
  domicilios: Array<{ direccion: string; localidad: string; provincia: string; codPostal: string; tipo: string }> | null
  cambio_categoria_desde: string | null
}

interface MesFacturado {
  mes: string
  afip: number
  manual: number
  total: number
}

interface Facturado {
  semestre: number
  ultimos12Meses: number
  facturasSemestre?: number
  facturasUltimos12Meses?: number
  manualSemestre?: number
  manualUltimos12Meses?: number
  porMes?: MesFacturado[]
}

export default function AfipPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [facturado, setFacturado] = useState<Facturado>({ semestre: 0, ultimos12Meses: 0 })
  const [categoriaManual, setCategoriaManual] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingCat, setSavingCat] = useState(false)

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/afip/padron')
      const data = await res.json()
      if (res.ok) {
        setSnapshot(data.snapshot)
        setFacturado(data.facturado || { semestre: 0, ultimos12Meses: 0 })
        setCategoriaManual(data.categoriaManual || null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function guardarCategoriaManual(letra: string) {
    setSavingCat(true)
    try {
      const res = await fetch('/api/afip/padron', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: letra }),
      })
      if (!res.ok) {
        toast.error('Error al guardar')
        return
      }
      setCategoriaManual(letra)
      toast.success(`Categoría ${letra} guardada`)
    } finally {
      setSavingCat(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/afip/padron', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al consultar AFIP')
        return
      }
      if (data.cambio_categoria_desde) {
        toast.success(`Categoría cambió: ${data.cambio_categoria_desde} → ${data.data.categoriaMonotributo}`)
      } else {
        toast.success('Padrón actualizado')
      }
      fetchData()
    } catch {
      toast.error('Error al consultar AFIP')
    } finally {
      setRefreshing(false)
    }
  }

  // Prioridad: lo que devuelve el padrón. Si no, lo manual.
  const letraActiva = snapshot?.categoria_monotributo?.charAt(0) || categoriaManual || null
  const fuenteCategoria: 'padron' | 'manual' | null = snapshot?.categoria_monotributo
    ? 'padron'
    : (categoriaManual ? 'manual' : null)

  const categoria = letraActiva ? getCategoria(letraActiva) : null
  const proxima = letraActiva ? getProximaCategoria(letraActiva) : null

  const riesgo = categoria ? calcularRiesgo(facturado.ultimos12Meses, categoria.topeAnual) : null
  const faltante = categoria ? calcularFaltante(facturado.ultimos12Meses, categoria.topeAnual) : null
  const fechaRecat = proximaRecategorizacion()

  const nombreCompleto = snapshot?.razon_social ||
    [snapshot?.apellido, snapshot?.nombre].filter(Boolean).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estado AFIP</h1>
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Consultando...' : 'Actualizar'}
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : !snapshot ? (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-muted-foreground">No hay datos consultados todavía.</p>
            <p className="text-sm text-muted-foreground">
              Antes de la primera consulta, asegurate de haber habilitado el servicio{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">ws_sr_padron_a13</code>{' '}
              en el portal AFIP (Administrador de Relaciones de Clave Fiscal → Adherir servicio).
            </p>
            <Button onClick={handleRefresh} disabled={refreshing} size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Consultar ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Datos generales */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Datos del contribuyente
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">CUIT:</span> <span className="font-medium tabular-nums">{snapshot.cuit}</span></div>
                <div><span className="text-muted-foreground">Estado:</span>{' '}
                  <Badge variant={snapshot.estado_clave === 'ACTIVO' ? 'default' : 'destructive'}>
                    {snapshot.estado_clave || '—'}
                  </Badge>
                </div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">Razón social:</span> <span className="font-medium">{nombreCompleto || '—'}</span></div>
                <div><span className="text-muted-foreground">Última consulta:</span> {new Date(snapshot.consultado_at).toLocaleString('es-AR')}</div>
              </div>
            </CardContent>
          </Card>

          {/* Categoría + Semáforo */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    Categoría Monotributo (Servicios)
                    {fuenteCategoria === 'padron' && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">desde padrón AFIP</Badge>
                    )}
                    {fuenteCategoria === 'manual' && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">manual</Badge>
                    )}
                  </div>
                  <div className="text-3xl font-bold mt-1">{categoria?.letra || '—'}</div>
                </div>
                {categoria && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Tope anual</div>
                    <div className="text-lg font-semibold tabular-nums">{formatPrecio(categoria.topeAnual)}</div>
                  </div>
                )}
              </div>

              {/* Selector manual: siempre disponible para corregir/cargar */}
              <div className="flex items-center gap-2 text-sm">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {fuenteCategoria === 'padron'
                    ? 'Override manual:'
                    : 'Cargar manualmente:'}
                </span>
                <Select
                  value={categoriaManual || ''}
                  onValueChange={guardarCategoriaManual}
                  disabled={savingCat}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue placeholder="Elegir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_SERVICIOS.map((c) => (
                      <SelectItem key={c.letra} value={c.letra}>
                        {c.letra} — hasta {formatPrecio(c.topeAnual)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!categoria && (
                <div className="text-xs text-muted-foreground italic">
                  El padrón AFIP no devolvió la categoría. Cargala manualmente arriba ↑ para activar el semáforo.
                </div>
              )}

                {snapshot.cambio_categoria_desde && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <strong>Categoría modificada</strong>: pasaste de{' '}
                      <strong>{snapshot.cambio_categoria_desde}</strong> a{' '}
                      <strong>{snapshot.categoria_monotributo}</strong>.
                    </div>
                  </div>
                )}

                {/* Semáforo */}
                {riesgo && categoria && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Facturado últimos 12 meses</span>
                      <span className="tabular-nums font-medium">
                        {formatPrecio(facturado.ultimos12Meses)} / {formatPrecio(categoria.topeAnual)}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          riesgo.nivel === 'verde' ? 'bg-green-500' :
                          riesgo.nivel === 'amarillo' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(riesgo.porcentaje, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium ${
                        riesgo.nivel === 'verde' ? 'text-green-600 dark:text-green-400' :
                        riesgo.nivel === 'amarillo' ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {riesgo.nivel === 'verde' && <><CheckCircle2 className="h-3 w-3 inline mr-1" />Dentro del tope</>}
                        {riesgo.nivel === 'amarillo' && <><AlertTriangle className="h-3 w-3 inline mr-1" />Acercándose al límite</>}
                        {riesgo.nivel === 'rojo' && <><AlertTriangle className="h-3 w-3 inline mr-1" />Riesgo de recategorización</>}
                      </span>
                      <span className="tabular-nums">{riesgo.porcentaje.toFixed(1)}%</span>
                    </div>
                  </div>
                )}

                {/* Faltantes hasta saltar categoría */}
                {faltante && categoria && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">
                      Faltante para saltar de categoría
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Faltante anual</div>
                        <div className="text-lg font-bold tabular-nums">{formatPrecio(faltante.faltanteAnual)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">
                          Podés facturar/mes (próximos {faltante.mesesHastaRecategorizacion} m)
                        </div>
                        <div className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                          {formatPrecio(faltante.promedioMensualPermitido)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Tu promedio mensual actual</div>
                        <div className={`text-lg font-bold tabular-nums ${
                          faltante.promedioMensualActual > faltante.promedioMensualPermitido
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-foreground'
                        }`}>
                          {formatPrecio(faltante.promedioMensualActual)}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground pt-1 border-t">
                      Próxima recategorización: <strong>{fechaRecat.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                    </div>
                  </div>
                )}

                {/* Desglose de facturado actual */}
                <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Semestre actual</div>
                    <div className="text-lg font-semibold tabular-nums">{formatPrecio(facturado.semestre)}</div>
                    {(facturado.manualSemestre || 0) > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        AFIP {formatPrecio(facturado.facturasSemestre || 0)} + manual {formatPrecio(facturado.manualSemestre || 0)}
                      </div>
                    )}
                  </div>
                  {proxima && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Próxima categoría ({proxima.letra})
                      </div>
                      <div className="text-lg font-semibold tabular-nums">{formatPrecio(proxima.topeAnual)}</div>
                    </div>
                  )}
                </div>

              <div className="text-xs text-muted-foreground pt-2 border-t">
                💡 AFIP recategoriza automáticamente cada 6 meses (enero y julio) tomando los <strong>últimos 12 meses</strong> de facturación.
                Si tu facturado supera el tope de tu categoría actual, vas a pasar a una superior.
              </div>
            </CardContent>
          </Card>

          {/* Desglose mensual */}
          {facturado.porMes && facturado.porMes.length > 0 && (() => {
            const maxTotal = Math.max(...facturado.porMes.map((m) => m.total), 1)
            const mesActual = new Date()
            const keyActual = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}`
            const meses12 = facturado.porMes
            const limiteMensual = categoria ? categoria.topeAnual / 12 : null
            return (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-semibold text-muted-foreground">
                      Detalle mensual — últimos 12 meses
                    </div>
                    {limiteMensual && (
                      <div className="text-xs text-muted-foreground">
                        Tope mensual promedio: <span className="font-semibold text-foreground tabular-nums">{formatPrecio(limiteMensual)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {meses12.map((m) => {
                      const [y, mm] = m.mes.split('-')
                      const fecha = new Date(parseInt(y), parseInt(mm) - 1, 1)
                      const label = fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
                      const pct = (m.total / maxTotal) * 100
                      const sobrepasa = limiteMensual ? m.total > limiteMensual : false
                      const isActual = m.mes === keyActual
                      return (
                        <div key={m.mes} className="grid grid-cols-[3.5rem_1fr_auto] gap-2 items-center text-xs">
                          <div className={`tabular-nums uppercase ${isActual ? 'font-semibold' : 'text-muted-foreground'}`}>
                            {label}
                          </div>
                          <div className="relative h-5 bg-muted/50 rounded overflow-hidden">
                            {m.afip > 0 && (
                              <div
                                className={`h-full ${sobrepasa ? 'bg-red-500' : 'bg-fuchsia-500'} transition-all`}
                                style={{ width: `${(m.afip / maxTotal) * 100}%` }}
                                title={`AFIP: ${formatPrecio(m.afip)}`}
                              />
                            )}
                            {m.manual > 0 && (
                              <div
                                className="h-full bg-amber-400 absolute top-0 transition-all"
                                style={{
                                  left: `${(m.afip / maxTotal) * 100}%`,
                                  width: `${(m.manual / maxTotal) * 100}%`,
                                }}
                                title={`Manual: ${formatPrecio(m.manual)}`}
                              />
                            )}
                            {limiteMensual && (
                              <div
                                className="absolute top-0 bottom-0 w-px bg-foreground/30"
                                style={{ left: `${(limiteMensual / maxTotal) * 100}%` }}
                                title={`Tope mensual: ${formatPrecio(limiteMensual)}`}
                              />
                            )}
                          </div>
                          <div className={`tabular-nums w-24 text-right ${
                            sobrepasa ? 'text-red-600 dark:text-red-400 font-semibold' :
                            isActual ? 'font-semibold' : ''
                          }`}>
                            {formatPrecio(m.total)}
                            {pct > 0 && pct < 100 && '​'}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-fuchsia-500 inline-block" />Facturado AFIP</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-amber-400 inline-block" />Manual</span>
                    {limiteMensual && (
                      <span className="flex items-center gap-1"><span className="h-2 w-px bg-foreground/30 inline-block" />Tope mensual</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Ingresos manuales */}
          <IngresosManuales onChange={fetchData} />

          {/* Impuestos activos */}
          {snapshot.impuestos && snapshot.impuestos.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <ScrollText className="h-4 w-4" />
                  Impuestos activos
                </div>
                <div className="flex flex-wrap gap-2">
                  {snapshot.impuestos.filter((i) => i.estado === 'ACTIVO').map((i) => (
                    <Badge key={i.id} variant="outline" className="gap-1">
                      <span className="text-muted-foreground tabular-nums">{i.id}</span>
                      <span>{i.descripcion}</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Referencia: tabla de categorías */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Tabla de categorías — Servicios</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {CATEGORIAS_SERVICIOS.map((c) => (
                  <div
                    key={c.letra}
                    className={`rounded border px-2 py-1.5 ${
                      categoria?.letra === c.letra ? 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/30' : 'border-border'
                    }`}
                  >
                    <div className="font-semibold">{c.letra}</div>
                    <div className="tabular-nums text-muted-foreground">{formatPrecio(c.topeAnual)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
