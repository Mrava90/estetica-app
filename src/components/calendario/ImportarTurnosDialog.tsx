'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Download, CheckCircle2, XCircle } from 'lucide-react'
import { formatPrecio } from '@/lib/dates'

/** Una fila del CSV, ya parseada y cruzada contra profesionales y servicios. */
export interface TurnoRow {
  fecha: string
  hora_inicio: string
  hora_fin: string
  profesional_name: string
  profesional_id: string | null
  cliente_name: string
  servicio_name: string
  servicio_id: string | null
  monto: number
  metodo_pago: 'efectivo' | 'mercadopago' | 'transferencia'
  notas: string
  valid: boolean
  errorMsg?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se llama despues de importar, para que el calendario se refresque. */
  onImportado: () => void
}

/**
 * Importacion masiva de turnos desde un CSV.
 *
 * Vive aparte de CalendarioView porque no comparte nada con el calendario:
 * tiene su propio estado, sus propias consultas y su propio dialogo. Lo unico
 * que devuelve al padre es el aviso de que hay turnos nuevos.
 *
 * Formato esperado (separador ; o ,):
 *   fecha · hora_inicio · hora_fin · profesional · cliente · servicio ·
 *   monto · metodo_pago · notas
 *
 * hora_fin y monto se autocompletan desde el servicio cuando vienen vacios.
 */
export function ImportarTurnosDialog({ open, onOpenChange, onImportado }: Props) {
  const supabase = createClient()
  const [preview, setPreview] = useState<TurnoRow[]>([])
  const [importing, setImporting] = useState(false)
  const [serviciosList, setServiciosList] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && serviciosList.length === 0) {
      supabase.from('servicios').select('nombre').eq('activo', true).then(({ data }) => {
        if (data) setServiciosList(data.map((s) => s.nombre))
      })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parseo ────────────────────────────────────────────────────────────────

  async function parseTurnosCsv(text: string): Promise<TurnoRow[]> {
    const [profsRes, servsRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre').eq('activo', true),
      supabase.from('servicios').select('id, nombre, duracion_minutos, precio_efectivo, precio_mercadopago').eq('activo', true),
    ])
    const profs = profsRes.data || []
    const servs = servsRes.data || []

    function matchProf(name: string): string | null {
      const n = name.toLowerCase().trim()
      const found = profs.find((p) => {
        const pn = p.nombre.toLowerCase()
        return pn === n || pn.startsWith(n) || n.startsWith(pn.split(' ')[0])
      })
      return found?.id || null
    }

    function findServ(name: string) {
      const n = name.toLowerCase().trim()
      return servs.find((s) => s.nombre.toLowerCase().includes(n) || n.includes(s.nombre.toLowerCase())) || null
    }

    function mapMetodo(raw: string): 'efectivo' | 'mercadopago' | 'transferencia' {
      const r = raw.toLowerCase().trim()
      if (r.includes('mp') || r.includes('mercado')) return 'mercadopago'
      if (r.includes('trans')) return 'transferencia'
      return 'efectivo'
    }

    function addMinutes(hora: string, mins: number): string {
      const [h, m] = hora.split(':').map(Number)
      const total = h * 60 + m + mins
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
    const sep = lines[0]?.includes(';') ? ';' : ','
    const firstLower = lines[0]?.toLowerCase() || ''
    const hasHeader = firstLower.includes('fecha') || firstLower.includes('hora')
    const data = hasHeader ? lines.slice(1) : lines

    return data.map((line) => {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
      const fechaRaw = cols[0] || ''
      const hora_inicio = cols[1]?.trim() || ''
      const hora_fin_raw = cols[2]?.trim() || ''
      const profesional_name = cols[3]?.trim() || ''
      const cliente_name = cols[4]?.trim() || ''
      const servicio_name = cols[5]?.trim() || ''
      const montoRaw = cols[6] || ''
      const metodo_pagoRaw = cols[7] || ''
      const notas = cols[8]?.trim() || ''

      // Parse date DD/MM/YYYY
      let fecha = ''
      const parts = fechaRaw.split('/')
      if (parts.length === 3) {
        fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
        fecha = fechaRaw
      }

      const metodo_pago = mapMetodo(metodo_pagoRaw)
      const profesional_id = profesional_name ? matchProf(profesional_name) : null
      const matchedServ = servicio_name ? findServ(servicio_name) : null
      const servicio_id = matchedServ?.id || null

      // Auto-fill hora_fin from service duration if not provided
      const hora_fin = hora_fin_raw || (
        matchedServ && hora_inicio
          ? addMinutes(hora_inicio, matchedServ.duracion_minutos)
          : ''
      )

      // Auto-fill monto from service price if not provided
      const rawMonto = parseFloat(montoRaw.replace(/[$\s"]/g, '').replace(',', '.')) || 0
      const monto = rawMonto > 0 ? rawMonto : (
        matchedServ
          ? (metodo_pago === 'efectivo' ? matchedServ.precio_efectivo : matchedServ.precio_mercadopago)
          : 0
      )

      const valid = !!fecha && !!hora_inicio && !!profesional_name && !!profesional_id
      const errorMsg = !fecha
        ? 'Fecha inválida'
        : !hora_inicio
          ? 'Hora requerida'
          : !profesional_name
            ? 'Profesional requerido'
            : !profesional_id
              ? `Profesional "${profesional_name}" no encontrado`
              : undefined

      return {
        fecha,
        hora_inicio,
        hora_fin,
        profesional_name,
        profesional_id,
        cliente_name,
        servicio_name,
        servicio_id,
        monto,
        metodo_pago,
        notas,
        valid: valid && !!profesional_id,
        errorMsg,
      }
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = await parseTurnosCsv(text)
    setPreview(rows)
  }

  // ── Importacion ───────────────────────────────────────────────────────────

  async function handleImportar() {
    const validRows = preview.filter((r) => r.valid)
    if (validRows.length === 0) return
    setImporting(true)

    // ── Resolver / crear clientes ─────────────────────────────
    const clienteMap: Record<string, string> = {} // nombre.lower → id
    const uniqueNames = [...new Set(validRows.filter((r) => r.cliente_name).map((r) => r.cliente_name))]
    let clientesCreados = 0

    if (uniqueNames.length > 0) {
      // Buscar existentes por nombre exacto
      const { data: existing } = await supabase
        .from('clientes')
        .select('id, nombre')
        .in('nombre', uniqueNames)
      for (const c of existing || []) {
        clienteMap[c.nombre.toLowerCase()] = c.id
      }

      // Crear los que no se encontraron
      const toCreate = uniqueNames.filter((n) => !clienteMap[n.toLowerCase()])
      for (const nombre of toCreate) {
        const { data: created } = await supabase
          .from('clientes')
          .insert({ nombre, telefono: `sin-tel-${Math.random().toString(36).slice(2, 10)}` })
          .select('id')
          .single()
        if (created) {
          clienteMap[nombre.toLowerCase()] = created.id
          clientesCreados++
        }
      }
    }

    const citasToInsert = validRows.map((r) => {
      const fechaInicio = `${r.fecha}T${r.hora_inicio}:00-03:00`
      const fechaFin = r.hora_fin
        ? `${r.fecha}T${r.hora_fin}:00-03:00`
        : `${r.fecha}T${String(parseInt(r.hora_inicio.split(':')[0]) + 1).padStart(2, '0')}:${r.hora_inicio.split(':')[1]}:00-03:00`

      const cliente_id = r.cliente_name ? (clienteMap[r.cliente_name.toLowerCase()] ?? null) : null

      // Si el servicio no se matcheó pero hay nombre, lo guardamos en notas
      const servicioNotas = r.servicio_name && !r.servicio_id ? r.servicio_name : ''
      const notasFinal = [servicioNotas, r.notas].filter(Boolean).join(' | ') || null

      return {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        profesional_id: r.profesional_id,
        servicio_id: r.servicio_id,
        cliente_id,
        status: 'confirmada' as const,
        precio_cobrado: r.monto || null,
        metodo_pago: r.metodo_pago,
        notas: notasFinal,
        origen: 'manual' as const,
      }
    })

    const { error } = await supabase.from('citas').insert(citasToInsert)
    if (error) {
      toast.error('Error al importar: ' + error.message)
    } else {
      let msg = `${validRows.length} turno(s) importados`
      if (clientesCreados > 0) msg += ` · ${clientesCreados} cliente(s) nuevo(s) creados`
      toast.success(msg)
      onOpenChange(false)
      setPreview([])
      if (inputRef.current) inputRef.current.value = ''
      onImportado()
    }
    setImporting(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const validos = preview.filter((r) => r.valid).length

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o)
      if (!o) { setPreview([]); if (inputRef.current) inputRef.current.value = '' }
    }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar turnos desde CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Download template */}
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
            <div className="text-sm">
              <p className="font-medium">Plantilla de ejemplo</p>
              <p className="text-xs text-muted-foreground">
                Columnas: fecha · hora_inicio · hora_fin · profesional · cliente · servicio · monto · metodo_pago · notas
              </p>
            </div>
            <a href="/templates/turnos-plantilla.csv" download>
              <Button variant="outline" size="sm" className="gap-2 shrink-0">
                <Download className="h-4 w-4" />
                Descargar plantilla
              </Button>
            </a>
          </div>

          <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-foreground">Separador:</span> punto y coma (;) — formato Excel Argentina</p>
            <p><span className="font-medium text-foreground">Fecha:</span> DD/MM/YYYY · <span className="font-medium text-foreground">Hora:</span> HH:MM (24h) · <span className="font-medium text-foreground">Método:</span> efectivo / mp / transferencia</p>
            <p><span className="font-medium text-foreground">Profesional:</span> nombre exacto o primeras letras (se mapea automáticamente)</p>
            {serviciosList.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Servicios disponibles:</span>{' '}
                {serviciosList.join(' · ')}
              </p>
            )}
            <p className="pt-0.5 text-[11px] italic">Si un cliente no existe en la base se crea automáticamente.</p>
          </div>

          <div className="space-y-2">
            <Label>Seleccionar archivo CSV</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>

          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{preview.length} turnos detectados</span>
                <span className="text-muted-foreground">
                  {validos} válidos · {preview.length - validos} con error
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Horario</TableHead>
                      <TableHead>Profesional</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow key={i} className={!row.valid ? 'bg-destructive/5' : ''}>
                        <TableCell className="min-w-[130px]">
                          {row.valid ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <span className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-[11px] leading-tight">{row.errorMsg}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{row.fecha || '—'}</TableCell>
                        <TableCell>{row.hora_inicio}{row.hora_fin ? `–${row.hora_fin}` : ''}</TableCell>
                        <TableCell className={!row.profesional_id ? 'text-destructive font-medium' : ''}>
                          {row.profesional_name || '—'}
                        </TableCell>
                        <TableCell>{row.cliente_name || '—'}</TableCell>
                        <TableCell className={row.servicio_name && !row.servicio_id ? 'text-amber-600 dark:text-amber-400' : ''}>
                          {row.servicio_name || '—'}
                          {row.servicio_name && !row.servicio_id && ' ⚠'}
                        </TableCell>
                        <TableCell className="text-right">{row.monto > 0 ? formatPrecio(row.monto) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.some((r) => !r.valid) && (
                <p className="text-xs text-muted-foreground">
                  Las filas con error se omitirán. Revisá los nombres de profesionales.
                </p>
              )}
              <Button
                className="w-full"
                onClick={handleImportar}
                disabled={importing || validos === 0}
              >
                {importing ? 'Importando...' : `Importar ${validos} turno(s)`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
