'use client'

import { useEffect, useState, useCallback } from 'react'
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

  const manana = addDays(new Date(), 1)
  const mananaStr = format(manana, 'yyyy-MM-dd')
  const mananaLabel = format(manana, "EEEE d 'de' MMMM", { locale: es })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Citas de mañana con status pendiente o confirmada
      const inicio = `${mananaStr}T00:00:00`
      const fin = `${mananaStr}T23:59:59`

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
  }, [mananaStr]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

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

  function abrirWhatsApp(cita: CitaRecordatorio) {
    const telefono = cita.clientes?.telefono
    if (!telefono) {
      toast.error('El cliente no tiene teléfono registrado')
      return
    }
    // Limpiar número: quitar espacios, guiones, paréntesis. Agregar 54 si es argentino sin código.
    let num = telefono.replace(/[\s\-().+]/g, '')
    if (num.startsWith('0')) num = num.slice(1)
    if (!num.startsWith('54')) num = `54${num}`
    const mensaje = encodeURIComponent(buildMensaje(cita))
    window.open(`https://wa.me/${num}?text=${mensaje}`, '_blank')
  }

  async function marcarEnviado(cita: CitaRecordatorio) {
    if (cita.recordatorio_enviado) {
      // Desmarcar: eliminar el recordatorio
      setEnviando(cita.id)
      const { error } = await supabase
        .from('recordatorios')
        .delete()
        .eq('id', cita.recordatorio_id!)
      if (error) {
        toast.error('Error al desmarcar')
      } else {
        toast.success('Desmarcado')
        fetchData()
      }
      setEnviando(null)
      return
    }

    setEnviando(cita.id)
    const { error } = await supabase.from('recordatorios').insert({
      cita_id: cita.id,
      tipo: 'whatsapp',
      status: 'enviado',
      enviado_at: new Date().toISOString(),
    })
    if (error) {
      toast.error('Error al marcar como enviado')
    } else {
      toast.success('Marcado como enviado')
      fetchData()
    }
    setEnviando(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Recordatorios — <span className="capitalize font-normal text-muted-foreground">{mananaLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : citas.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hay turnos para mañana.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Servicio</th>
                  <th className="pb-2 pr-3 font-medium">Hora</th>
                  <th className="pb-2 pr-3 font-medium">Teléfono</th>
                  <th className="pb-2 pr-3 font-medium text-center">WA</th>
                  <th className="pb-2 font-medium text-center">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {citas.map((cita) => (
                  <tr key={cita.id} className={cita.recordatorio_enviado ? 'opacity-50' : ''}>
                    <td className="py-3 pr-3 font-medium">
                      {cita.clientes?.nombre ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {cita.servicios?.nombre ?? '—'}
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      {format(new Date(cita.fecha_inicio), 'HH:mm')}
                    </td>
                    <td className="py-3 pr-3">
                      {cita.clientes?.telefono ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {cita.clientes.telefono}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Sin tel.</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                        onClick={() => abrirWhatsApp(cita)}
                        disabled={!cita.clientes?.telefono}
                        title="Abrir chat WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </td>
                    <td className="py-3 text-center">
                      <Button
                        variant={cita.recordatorio_enviado ? 'default' : 'outline'}
                        size="icon"
                        className={`h-8 w-8 ${cita.recordatorio_enviado ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        onClick={() => marcarEnviado(cita)}
                        disabled={enviando === cita.id}
                        title={cita.recordatorio_enviado ? 'Desmarcar' : 'Marcar como enviado'}
                      >
                        {enviando === cita.id ? (
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
              El icono de WhatsApp abre el chat con el mensaje de recordatorio pre-cargado. Marcá el tick después de enviar.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
