'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { MessageCircle, Check, Loader2, Phone } from 'lucide-react'

interface CitaRecordatorio {
  id: string
  fecha_inicio: string
  clientes: { nombre: string; telefono: string | null } | null
  servicios: { nombre: string } | null
  profesionales: { nombre: string } | null
  recordatorio_enviado: boolean
  recordatorio_id: string | null
}

interface CitaGroup {
  key: string
  clienteNombre: string
  telefono: string | null
  citas: CitaRecordatorio[]
  allEnviado: boolean
}

interface Props {
  open: boolean
  onClose: () => void
}

export function RecordatoriosDialog({ open, onClose }: Props) {
  const [citas, setCitas] = useState<CitaRecordatorio[]>([])
  const [mensajeTemplate, setMensajeTemplate] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)

  const supabase = createClient()

  const hoy = new Date()
  const hoyStr = format(hoy, 'yyyy-MM-dd')
  const hoyLabel = format(hoy, "EEEE d 'de' MMMM", { locale: es })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const inicio = `${hoyStr}T00:00:00`
      const fin = `${hoyStr}T23:59:59`

      const [citasRes, configRes, recordatoriosRes] = await Promise.all([
        supabase
          .from('citas')
          .select('id, fecha_inicio, clientes(nombre, telefono), servicios(nombre), profesionales(nombre)')
          .in('status', ['pendiente', 'confirmada'])
          .gte('fecha_inicio', inicio)
          .lte('fecha_inicio', fin)
          .order('fecha_inicio'),
        supabase.from('configuracion').select('mensaje_recordatorio').single(),
        supabase
          .from('recordatorios')
          .select('id, cita_id, status')
          .eq('tipo', 'whatsapp')
          .in('status', ['enviado']),
      ])

      if (configRes.data?.mensaje_recordatorio) {
        setMensajeTemplate(configRes.data.mensaje_recordatorio)
      }

      const recordatoriosMap: Record<string, string> = {}
      for (const r of recordatoriosRes.data || []) {
        if (r.cita_id) recordatoriosMap[r.cita_id] = r.id
      }

      const citasConEstado: CitaRecordatorio[] = (citasRes.data || []).map((c) => ({
        id: c.id,
        fecha_inicio: c.fecha_inicio,
        clientes: c.clientes as unknown as { nombre: string; telefono: string | null } | null,
        servicios: c.servicios as unknown as { nombre: string } | null,
        profesionales: c.profesionales as unknown as { nombre: string } | null,
        recordatorio_enviado: !!recordatoriosMap[c.id],
        recordatorio_id: recordatoriosMap[c.id] ?? null,
      }))

      setCitas(citasConEstado)
    } finally {
      setLoading(false)
    }
  }, [hoyStr]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  // Agrupar por cliente (teléfono o nombre) para no enviar mensajes duplicados
  const citaGroups = useMemo((): CitaGroup[] => {
    const map = new Map<string, CitaGroup>()
    citas.forEach(cita => {
      const key = cita.clientes?.telefono || cita.clientes?.nombre || cita.id
      if (!map.has(key)) {
        map.set(key, {
          key,
          clienteNombre: cita.clientes?.nombre || '—',
          telefono: cita.clientes?.telefono || null,
          citas: [],
          allEnviado: false,
        })
      }
      map.get(key)!.citas.push(cita)
    })
    map.forEach(g => { g.allEnviado = g.citas.every(c => c.recordatorio_enviado) })
    return Array.from(map.values())
  }, [citas])

  function buildMensaje(cita: CitaRecordatorio): string {
    const fecha = format(new Date(cita.fecha_inicio), "EEEE d 'de' MMMM", { locale: es })
    const hora = format(new Date(cita.fecha_inicio), 'HH:mm')
    return mensajeTemplate
      .replace('{cliente}', cita.clientes?.nombre ?? '')
      .replace('{servicio}', cita.servicios?.nombre ?? '')
      .replace('{profesional}', cita.profesionales?.nombre ?? '')
      .replace('{fecha}', fecha)
      .replace('{hora}', hora)
  }

  function buildMensajeGrupo(group: CitaGroup): string {
    if (group.citas.length === 1) return buildMensaje(group.citas[0])
    // Múltiples turnos: listar todos los servicios/horarios
    const primera = group.citas[0]
    const fecha = format(new Date(primera.fecha_inicio), "EEEE d 'de' MMMM", { locale: es })
    const serviciosDetalle = group.citas
      .map(c => `${c.servicios?.nombre ?? 'turno'} a las ${format(new Date(c.fecha_inicio), 'HH:mm')}`)
      .join(' y ')
    return mensajeTemplate
      .replace('{cliente}', group.clienteNombre)
      .replace('{servicio}', serviciosDetalle)
      .replace('{profesional}', primera.profesionales?.nombre ?? '')
      .replace('{fecha}', fecha)
      .replace('{hora}', format(new Date(primera.fecha_inicio), 'HH:mm'))
  }

  async function abrirWhatsAppGrupo(group: CitaGroup) {
    const telefono = group.telefono
    if (!telefono) {
      toast.error('El cliente no tiene teléfono registrado')
      return
    }
    let num = telefono.replace(/[\s\-().+]/g, '')
    if (num.startsWith('0')) num = num.slice(1)
    if (!num.startsWith('54')) num = `54${num}`
    const mensaje = encodeURIComponent(buildMensajeGrupo(group))
    window.open(`https://wa.me/${num}?text=${mensaje}`, '_blank')

    // Auto-marcar como enviado al abrir WhatsApp
    if (!group.allEnviado) {
      setEnviando(group.key)
      try {
        for (const cita of group.citas) {
          if (!cita.recordatorio_enviado) {
            await supabase.from('recordatorios').insert({
              cita_id: cita.id,
              tipo: 'whatsapp',
              status: 'enviado',
              enviado_at: new Date().toISOString(),
            })
          }
        }
        fetchData()
      } catch {
        // fallo silencioso en auto-marcado
      } finally {
        setEnviando(null)
      }
    }
  }

  async function marcarGrupoEnviado(group: CitaGroup) {
    setEnviando(group.key)
    try {
      if (group.allEnviado) {
        // Desmarcar todos
        for (const cita of group.citas) {
          if (cita.recordatorio_enviado && cita.recordatorio_id) {
            await supabase.from('recordatorios').delete().eq('id', cita.recordatorio_id)
          }
        }
        toast.success('Desmarcado')
      } else {
        // Marcar todos como enviados
        for (const cita of group.citas) {
          if (!cita.recordatorio_enviado) {
            await supabase.from('recordatorios').insert({
              cita_id: cita.id,
              tipo: 'whatsapp',
              status: 'enviado',
              enviado_at: new Date().toISOString(),
            })
          }
        }
        toast.success('Marcado como enviado')
      }
      fetchData()
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Recordatorios — <span className="capitalize font-normal text-muted-foreground">{hoyLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : citaGroups.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hay turnos para hoy.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Servicio</th>
                  <th className="pb-2 pr-3 font-medium">Hora</th>
                  <th className="pb-2 pr-3 font-medium">Teléfono</th>
                  <th className="pb-2 pr-3 font-medium text-center">WhatsApp</th>
                  <th className="pb-2 font-medium text-center">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {citaGroups.map((group) => (
                  <tr key={group.key} className={group.allEnviado ? 'opacity-50' : ''}>
                    <td className="py-3 pr-3 font-medium">
                      {group.clienteNombre}
                      {group.citas.length > 1 && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">×{group.citas.length}</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {group.citas.length === 1
                        ? (group.citas[0].servicios?.nombre ?? '—')
                        : group.citas.map(c => c.servicios?.nombre ?? '—').join(' + ')
                      }
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {format(new Date(group.citas[0].fecha_inicio), 'HH:mm')}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {group.telefono ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {group.telefono}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Sin tel.</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-center">
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => abrirWhatsAppGrupo(group)}
                        disabled={!group.telefono}
                        title="Abrir chat WhatsApp"
                      >
                        <MessageCircle className="h-5 w-5" />
                        WA
                      </Button>
                    </td>
                    <td className="py-3 text-center">
                      <Button
                        variant={group.allEnviado ? 'default' : 'outline'}
                        size="icon"
                        className={`h-8 w-8 ${group.allEnviado ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        onClick={() => marcarGrupoEnviado(group)}
                        disabled={enviando === group.key}
                        title={group.allEnviado ? 'Desmarcar' : 'Marcar como enviado'}
                      >
                        {enviando === group.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-xs text-muted-foreground">
              Al hacer clic en WA se abre el chat y se marca automáticamente como enviado. Si el mensaje falló, usá el tick para desmarcarlo y volver a enviarlo.
              {citaGroups.some(g => g.citas.length > 1) && ' Los clientes con múltiples turnos reciben un único mensaje.'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
