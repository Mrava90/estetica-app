'use client'

/**
 * Servicios → Mails. Plantillas de mail y envio a clientas por el Gmail del
 * local (ver /api/mails y migracion 00049). Una plantilla puede ir atada a una
 * promocion: el mail lleva su cartel y un boton para reservar. Desde la tarjeta
 * de una promo se llega con ?promo=<id> y se abre la plantilla ya armada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Promocion, Servicio } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Mail, Plus, Pencil, Trash2, Send, Loader2, Users } from 'lucide-react'

interface Plantilla {
  id: string
  nombre: string
  asunto: string
  cuerpo: string
  promocion_id: string | null
  promociones: { nombre: string; imagen_url: string | null } | null
}
interface Destinataria { id: string; nombre: string; apellido: string | null; email: string }
interface Grupo { dia: string; plantilla: string; enviados: number; fallidos: number }

const LOTE = 15 // igual que LOTE en src/lib/mails.ts
const SIN_PROMO = 'ninguna'

const vacia = { id: '', nombre: '', asunto: '', cuerpo: '', promocion_id: SIN_PROMO }

/** Igual que completar() de src/lib/mails.ts, para la vista previa. */
function completar(texto: string, nombre: string, apellido: string | null) {
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
  return texto.replace(/\{nombre\}/gi, cap(nombre.trim().split(/\s+/)[0] || '')).replace(/\{apellido\}/gi, cap((apellido || '').trim()))
}

export default function MailsSeccion() {
  const router = useRouter()
  const params = useSearchParams()
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [promos, setPromos] = useState<Promocion[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [bajas, setBajas] = useState(0)

  const [editando, setEditando] = useState<typeof vacia | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [plantillaId, setPlantillaId] = useState('')
  const [tipo, setTipo] = useState('todas')
  const [dias, setDias] = useState('60')
  const [servicioId, setServicioId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [clientaId, setClientaId] = useState('')
  const [clientasBusqueda, setClientasBusqueda] = useState<{ id: string; nombre: string; apellido: string | null; email: string | null }[]>([])
  // Exclusiones: por defecto no se le manda a quien vino hace poco ni a quien ya tiene turno
  const [excluirRecientes, setExcluirRecientes] = useState(true)
  const [recientesDias, setRecientesDias] = useState('20')
  const [excluirConTurno, setExcluirConTurno] = useState(true)
  const [lista, setLista] = useState<Destinataria[] | null>(null)
  const [omitidas, setOmitidas] = useState({ baja: 0, repetidas: 0, recientes: 0, con_turno: 0 })
  const [buscando, setBuscando] = useState(false)
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [rp, rh, { data: pr }, { data: sv }] = await Promise.all([
      fetch('/api/mails/plantillas'), fetch('/api/mails/historial'),
      supabase.from('promociones').select('*').order('created_at', { ascending: false }),
      supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
    ])
    if (rp.ok) setPlantillas((await rp.json()).plantillas || [])
    if (rh.ok) { const j = await rh.json(); setGrupos(j.grupos || []); setBajas(j.bajas || 0) }
    setPromos((pr || []) as Promocion[])
    setServicios((sv || []) as Servicio[])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Llegada desde "Enviar por mail" de una promocion: plantilla ya armada.
  const promoParam = params.get('promo')
  useEffect(() => {
    if (!promoParam || promos.length === 0) return
    const p = promos.find(x => x.id === promoParam)
    if (!p) return
    const existente = plantillas.find(x => x.promocion_id === p.id)
    if (existente) setPlantillaId(existente.id)
    else setEditando({
      id: '', nombre: p.nombre, asunto: `${p.nombre} en Ka Wirth 💅`,
      cuerpo: `Hola {nombre}!\n\n${p.descripcion || p.nombre}\n\nTe esperamos en Ka Wirth Villa Ballester.`,
      promocion_id: p.id,
    })
    router.replace('/servicios?tab=mails')
  }, [promoParam, promos, plantillas, router])

  // Busqueda de una clienta puntual
  useEffect(() => {
    if (tipo !== 'clienta' || busqueda.trim().length < 2) { setClientasBusqueda([]); return }
    const t = setTimeout(async () => {
      const q = busqueda.trim().replace(/[%,()]/g, '')
      const { data } = await createClient().from('clientes').select('id, nombre, apellido, email')
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`).not('email', 'is', null).limit(8)
      setClientasBusqueda(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda, tipo])

  // Cambiar el segmento o la plantilla invalida la lista calculada
  useEffect(() => { setLista(null) }, [plantillaId, tipo, dias, servicioId, clientaId, excluirRecientes, recientesDias, excluirConTurno])

  const plantilla = plantillas.find(p => p.id === plantillaId)

  async function guardar() {
    if (!editando) return
    setGuardando(true)
    try {
      const body = { ...editando, promocion_id: editando.promocion_id === SIN_PROMO ? null : editando.promocion_id }
      const r = await fetch('/api/mails/plantillas', {
        method: editando.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'No se pudo guardar'); return }
      toast.success('Plantilla guardada')
      if (!editando.id && j.id) setPlantillaId(j.id)
      setEditando(null)
      cargar()
    } finally { setGuardando(false) }
  }

  async function borrar(p: Plantilla) {
    if (!confirm(`¿Borrar la plantilla "${p.nombre}"? El historial de envíos queda.`)) return
    const r = await fetch(`/api/mails/plantillas?id=${p.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Plantilla borrada'); if (plantillaId === p.id) setPlantillaId(''); cargar() }
    else toast.error('No se pudo borrar')
  }

  async function verDestinatarias() {
    setBuscando(true)
    try {
      const r = await fetch('/api/mails/destinatarias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: plantillaId || null, segmento: { tipo, dias: Number(dias), servicio_id: servicioId, cliente_id: clientaId },
          excluir: { recientes_dias: excluirRecientes ? Number(recientesDias) : 0, con_turno: excluirConTurno },
        }),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'No se pudo calcular'); return }
      setLista(j.destinatarias); setOmitidas(j.omitidas)
    } finally { setBuscando(false) }
  }

  async function enviar() {
    if (!plantilla || !lista?.length) return
    if (!confirm(`¿Mandar "${plantilla.asunto}" a ${lista.length} clienta${lista.length === 1 ? '' : 's'}?`)) return
    let enviados = 0, omit = 0, errores = 0, tope = false
    setProgreso({ hechos: 0, total: lista.length })
    for (let i = 0; i < lista.length && !tope; i += LOTE) {
      const ids = lista.slice(i, i + LOTE).map(d => d.id)
      const r = await fetch('/api/mails/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plantilla_id: plantilla.id, cliente_ids: ids }),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'Falló el envío'); break }
      enviados += j.enviados; omit += j.omitidos.length; errores += j.errores.length; tope = j.topeAlcanzado
      setProgreso({ hechos: Math.min(i + LOTE, lista.length), total: lista.length })
    }
    setProgreso(null); setLista(null)
    toast.success(`Enviados: ${enviados}` + (omit ? ` · omitidos: ${omit}` : '') + (errores ? ` · con error: ${errores}` : ''))
    if (tope) toast.warning('Se llegó al tope diario de Gmail: el resto, mañana.')
    cargar()
  }

  const ejemplo = lista?.[0]
  const vistaPrevia = useMemo(() => plantilla && ejemplo ? {
    asunto: completar(plantilla.asunto, ejemplo.nombre, ejemplo.apellido),
    cuerpo: completar(plantilla.cuerpo, ejemplo.nombre, ejemplo.apellido),
  } : null, [plantilla, ejemplo])

  return (
    <div className="space-y-6">
      {/* Plantillas */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Plantillas</CardTitle>
            <CardDescription>Mails predeterminados. Usá {'{nombre}'} para el nombre de la clienta.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setEditando({ ...vacia })}><Plus className="h-4 w-4" /> Nueva</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {plantillas.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay plantillas.</p>}
          {plantillas.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              {p.promociones?.imagen_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.promociones.imagen_url} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                : <div className="h-10 w-10 rounded bg-fuchsia-50 flex items-center justify-center shrink-0"><Mail className="h-4 w-4 text-fuchsia-600" /></div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{p.asunto}{p.promociones ? ` · promo: ${p.promociones.nombre}` : ''}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar"
                onClick={() => setEditando({ id: p.id, nombre: p.nombre, asunto: p.asunto, cuerpo: p.cuerpo, promocion_id: p.promocion_id || SIN_PROMO })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Borrar" onClick={() => borrar(p)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Envio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Enviar</CardTitle>
          <CardDescription>Sale desde el Gmail del local, un mail por clienta. No se manda a quien se dio de baja ni repite la misma plantilla en 7 días.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Plantilla</Label>
              <Select value={plantillaId} onValueChange={setPlantillaId}>
                <SelectTrigger><SelectValue placeholder="Elegí una plantilla" /></SelectTrigger>
                <SelectContent>{plantillas.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>A quién</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las clientas con mail</SelectItem>
                  <SelectItem value="inactivas">Las que no vienen hace un tiempo</SelectItem>
                  <SelectItem value="servicio">Las que se hicieron un servicio</SelectItem>
                  <SelectItem value="clienta">Una clienta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipo === 'inactivas' && (
            <div className="flex items-center gap-2 text-sm">
              Sin venir hace más de
              <Input type="number" min={1} value={dias} onChange={e => setDias(e.target.value)} className="w-20 h-8" />
              días
            </div>
          )}
          {tipo === 'servicio' && (
            <Select value={servicioId} onValueChange={setServicioId}>
              <SelectTrigger className="md:w-1/2"><SelectValue placeholder="Elegí el servicio" /></SelectTrigger>
              <SelectContent>{servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {tipo === 'clienta' && (
            <div className="space-y-2 md:w-1/2">
              <Input placeholder="Buscar por nombre o mail" value={busqueda} onChange={e => { setBusqueda(e.target.value); setClientaId('') }} />
              {clientasBusqueda.length > 0 && !clientaId && (
                <div className="rounded-md border divide-y">
                  {clientasBusqueda.map(c => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                      onClick={() => { setClientaId(c.id); setBusqueda(`${c.nombre} ${c.apellido || ''}`.trim()) }}>
                      {c.nombre} {c.apellido} <span className="text-muted-foreground">· {c.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">No mandar a…</p>
            <label className="flex flex-wrap items-center gap-2 cursor-pointer">
              <Checkbox checked={excluirRecientes} onCheckedChange={v => setExcluirRecientes(!!v)} />
              las que vinieron hace menos de
              <Input type="number" min={1} value={recientesDias} onChange={e => setRecientesDias(e.target.value)} className="w-16 h-7" disabled={!excluirRecientes} />
              días
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={excluirConTurno} onCheckedChange={v => setExcluirConTurno(!!v)} />
              las que ya tienen un turno reservado
            </label>
          </div>

          <Button variant="outline" className="gap-2" onClick={verDestinatarias}
            disabled={buscando || (tipo === 'servicio' && !servicioId) || (tipo === 'clienta' && !clientaId)}>
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Ver destinatarias
          </Button>

          {lista && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm">
                <strong>{lista.length}</strong> clienta{lista.length === 1 ? '' : 's'}
                {omitidas.baja > 0 && <span className="text-muted-foreground"> · {omitidas.baja} se dieron de baja</span>}
                {omitidas.repetidas > 0 && <span className="text-muted-foreground"> · {omitidas.repetidas} ya la recibieron esta semana</span>}
                {omitidas.recientes > 0 && <span className="text-muted-foreground"> · {omitidas.recientes} vinieron hace poco</span>}
                {omitidas.con_turno > 0 && <span className="text-muted-foreground"> · {omitidas.con_turno} ya tienen turno</span>}
              </p>
              {lista.length > 0 && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {lista.slice(0, 12).map(d => `${d.nombre} ${d.apellido || ''}`.trim()).join(', ')}{lista.length > 12 ? '…' : ''}
                </p>
              )}
              {vistaPrevia && plantilla && (
                <div className="rounded-md bg-muted/40 p-3 space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground">Vista previa (para {ejemplo!.nombre})</p>
                  <p className="font-medium">{vistaPrevia.asunto}</p>
                  {plantilla.promociones?.imagen_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={plantilla.promociones.imagen_url} alt="" className="max-h-64 rounded-md" />
                  )}
                  <p className="whitespace-pre-wrap text-muted-foreground">{vistaPrevia.cuerpo}</p>
                  {plantilla.promociones?.imagen_url && <span className="inline-block rounded-md bg-fuchsia-700 px-4 py-1.5 text-xs font-semibold text-white">Reservar turno</span>}
                </div>
              )}
              <Button className="gap-2" onClick={enviar} disabled={!plantilla || lista.length === 0 || !!progreso}>
                {progreso ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando {progreso.hechos}/{progreso.total}</> : <><Send className="h-4 w-4" /> Enviar a {lista.length}</>}
              </Button>
              {!plantilla && <p className="text-xs text-amber-700">Elegí una plantilla para poder enviar.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviados</CardTitle>
          <CardDescription>{bajas} clienta{bajas === 1 ? '' : 's'} se dieron de baja de los mails.</CardDescription>
        </CardHeader>
        <CardContent>
          {grupos.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no se mandó ninguno.</p> : (
            <div className="divide-y text-sm">
              {grupos.map(g => (
                <div key={g.dia + g.plantilla} className="flex justify-between py-1.5">
                  <span>{g.dia.split('-').reverse().join('/')} · {g.plantilla}</span>
                  <span className="text-muted-foreground">{g.enviados} enviados{g.fallidos ? ` · ${g.fallidos} con error` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={o => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editando?.id ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle></DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre (solo para vos)</Label>
                <Input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Te extrañamos" maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label>Asunto</Label>
                <Input value={editando.asunto} onChange={e => setEditando({ ...editando, asunto: e.target.value })} placeholder="Ej: {nombre}, te extrañamos 💖" maxLength={150} />
              </div>
              <div className="space-y-1.5">
                <Label>Promoción <span className="font-normal text-muted-foreground">(opcional: suma su imagen y un botón para reservar)</span></Label>
                <Select value={editando.promocion_id} onValueChange={v => setEditando({ ...editando, promocion_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_PROMO}>Ninguna</SelectItem>
                    {promos.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}{p.imagen_url ? '' : ' (sin imagen)'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Texto</Label>
                <Textarea rows={8} value={editando.cuerpo} onChange={e => setEditando({ ...editando, cuerpo: e.target.value })}
                  placeholder={'Hola {nombre}!\n\nEste mes tenemos…'} />
                <p className="text-xs text-muted-foreground">Dejá una línea en blanco para separar párrafos. Al pie va solo el enlace para darse de baja.</p>
              </div>
              <Button onClick={guardar} disabled={guardando} className="w-full">{guardando ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
