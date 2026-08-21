'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import type { Promocion, Servicio, Profesional } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Sparkles, Clock, CalendarDays, Percent, Loader2, Search, ImageIcon, X } from 'lucide-react'
import { descripcionDescuento, descripcionHorario } from '@/lib/promociones'

const DIAS = [
  { n: 1, label: 'Lun' },
  { n: 2, label: 'Mar' },
  { n: 3, label: 'Mié' },
  { n: 4, label: 'Jue' },
  { n: 5, label: 'Vie' },
  { n: 6, label: 'Sáb' },
  { n: 0, label: 'Dom' },
]

interface FormState {
  id?: string
  nombre: string
  descripcion: string
  tipo_descuento: 'pct' | 'monto' | 'override'
  descuento_valor: string
  precios_override: Record<string, string>  // servicio_id → precio (string para edición)
  metodo_pago_requerido: '' | 'efectivo' | 'mercadopago' | 'transferencia'
  dias_semana: number[]
  hora_desde: string
  hora_hasta: string
  fecha_desde: string
  fecha_hasta: string
  servicios_ids: string[]
  profesionales_ids: string[]
  imagen_url: string
  activa: boolean
}

function emptyForm(): FormState {
  return {
    nombre: '',
    descripcion: '',
    tipo_descuento: 'pct',
    descuento_valor: '',
    precios_override: {},
    metodo_pago_requerido: '',
    dias_semana: [],
    hora_desde: '',
    hora_hasta: '',
    fecha_desde: '',
    fecha_hasta: '',
    servicios_ids: [],
    profesionales_ids: [],
    imagen_url: '',
    activa: true,
  }
}

function promoToForm(p: Promocion): FormState {
  const tipo: 'pct' | 'monto' | 'override' = p.precios_override && Object.keys(p.precios_override).length > 0
    ? 'override'
    : p.descuento_pct != null ? 'pct' : 'monto'
  const overrideStr: Record<string, string> = {}
  if (p.precios_override) {
    for (const [k, v] of Object.entries(p.precios_override)) overrideStr[k] = String(v)
  }
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    tipo_descuento: tipo,
    descuento_valor: String(p.descuento_pct ?? p.descuento_monto ?? ''),
    precios_override: overrideStr,
    metodo_pago_requerido: p.metodo_pago_requerido || '',
    dias_semana: p.dias_semana || [],
    hora_desde: p.hora_desde?.slice(0, 5) || '',
    hora_hasta: p.hora_hasta?.slice(0, 5) || '',
    fecha_desde: p.fecha_desde || '',
    fecha_hasta: p.fecha_hasta || '',
    servicios_ids: p.servicios_ids || [],
    profesionales_ids: p.profesionales_ids || [],
    imagen_url: p.imagen_url || '',
    activa: p.activa,
  }
}

function formToPayload(f: FormState) {
  const valor = Number(f.descuento_valor)
  let precios_override: Record<string, number> | null = null
  if (f.tipo_descuento === 'override') {
    precios_override = {}
    for (const [k, v] of Object.entries(f.precios_override)) {
      const n = Number(v)
      if (n > 0) precios_override[k] = n
    }
    if (Object.keys(precios_override).length === 0) precios_override = null
  }
  return {
    nombre: f.nombre,
    descripcion: f.descripcion || null,
    descuento_pct: f.tipo_descuento === 'pct' ? valor : null,
    descuento_monto: f.tipo_descuento === 'monto' ? valor : null,
    precios_override,
    metodo_pago_requerido: f.metodo_pago_requerido || null,
    dias_semana: f.dias_semana.length > 0 ? f.dias_semana : null,
    hora_desde: f.hora_desde || null,
    hora_hasta: f.hora_hasta || null,
    fecha_desde: f.fecha_desde || null,
    fecha_hasta: f.fecha_hasta || null,
    servicios_ids: f.servicios_ids.length > 0 ? f.servicios_ids : null,
    profesionales_ids: f.profesionales_ids.length > 0 ? f.profesionales_ids : null,
    imagen_url: f.imagen_url || null,
    activa: f.activa,
  }
}

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promocion[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [busquedaServicios, setBusquedaServicios] = useState('')
  const [uploadingImagen, setUploadingImagen] = useState(false)
  const imagenInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleImagenUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\//.test(file.type)) { toast.error('El archivo debe ser una imagen'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return }

    setUploadingImagen(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      // Nombre único: id de la promo si edita, o timestamp si nueva
      const base = form.id || `nueva-${Date.now()}`
      const path = `${base}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('promociones-imagenes')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('promociones-imagenes').getPublicUrl(path)
      const urlConCache = `${publicUrl}?t=${Date.now()}`
      setForm(f => ({ ...f, imagen_url: urlConCache }))
      toast.success('Imagen subida')
    } catch (err: any) {
      toast.error(err?.message || 'Error al subir imagen')
    } finally {
      setUploadingImagen(false)
      if (imagenInputRef.current) imagenInputRef.current.value = ''
    }
  }

  function handleQuitarImagen() {
    setForm(f => ({ ...f, imagen_url: '' }))
  }

  async function fetchAll() {
    setLoading(true)
    try {
      const [promosRes, servRes, profRes] = await Promise.all([
        fetch('/api/promociones').then(r => r.json()),
        supabase.from('servicios').select('id, nombre, precio_efectivo, precio_mercadopago, duracion_minutos, activo').eq('activo', true).order('nombre'),
        supabase.from('profesionales').select('id, nombre, color, activo').eq('activo', true).order('nombre'),
      ])
      setPromos(promosRes.items || [])
      setServicios((servRes.data || []) as unknown as Servicio[])
      setProfesionales((profRes.data || []) as unknown as Profesional[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setForm(emptyForm())
    setBusquedaServicios('')
    setDialogOpen(true)
  }

  function openEdit(p: Promocion) {
    setForm(promoToForm(p))
    setBusquedaServicios('')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return }

    if (form.tipo_descuento === 'override') {
      const validos = Object.values(form.precios_override).filter(v => Number(v) > 0).length
      if (validos === 0) {
        toast.error('Cargá al menos un servicio con precio promo')
        return
      }
    } else {
      const valor = Number(form.descuento_valor)
      if (!valor || valor <= 0) { toast.error('Descuento requerido'); return }
      if (form.tipo_descuento === 'pct' && valor > 100) { toast.error('% debe ser <= 100'); return }
    }

    if (form.hora_desde && form.hora_hasta && form.hora_desde >= form.hora_hasta) {
      toast.error('La hora de fin debe ser mayor a la de inicio'); return
    }

    setSaving(true)
    try {
      const payload = formToPayload(form)
      const url = form.id ? `/api/promociones/${form.id}` : '/api/promociones'
      const method = form.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(form.id ? 'Promo actualizada' : 'Promo creada')
      setDialogOpen(false)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActiva(p: Promocion) {
    const res = await fetch(`/api/promociones/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !p.activa }),
    })
    if (res.ok) fetchAll()
    else toast.error('Error al cambiar estado')
  }

  async function handleDelete(p: Promocion) {
    if (!confirm(`¿Eliminar la promo "${p.nombre}"?`)) return
    const res = await fetch(`/api/promociones/${p.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Eliminada')
      fetchAll()
    } else toast.error('Error al eliminar')
  }

  function toggleDia(d: number) {
    setForm(f => ({
      ...f,
      dias_semana: f.dias_semana.includes(d) ? f.dias_semana.filter(x => x !== d) : [...f.dias_semana, d].sort(),
    }))
  }

  function toggleServicio(id: string) {
    setForm(f => ({
      ...f,
      servicios_ids: f.servicios_ids.includes(id) ? f.servicios_ids.filter(x => x !== id) : [...f.servicios_ids, id],
    }))
  }

  function toggleProfesional(id: string) {
    setForm(f => ({
      ...f,
      profesionales_ids: f.profesionales_ids.includes(id) ? f.profesionales_ids.filter(x => x !== id) : [...f.profesionales_ids, id],
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-fuchsia-500" />
            Promociones
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Happy Hours, descuentos por día/horario, promos temporales. Aplican automáticamente al reservar.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva promo
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : promos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-2">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">Todavía no hay promos creadas.</p>
            <Button onClick={openNew} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Crear la primera
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {promos.map(p => {
            const nomServ = p.servicios_ids ? servicios.filter(s => p.servicios_ids!.includes(s.id)).map(s => s.nombre) : []
            const nomProf = p.profesionales_ids ? profesionales.filter(pr => p.profesionales_ids!.includes(pr.id)).map(pr => pr.nombre) : []
            return (
              <Card key={p.id} className={p.activa ? '' : 'opacity-60'}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{p.nombre}</h3>
                        <Badge variant="outline" className="text-[10px] font-bold text-fuchsia-600 border-fuchsia-300 shrink-0">
                          {descripcionDescuento(p)}
                        </Badge>
                      </div>
                      {p.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{p.descripcion}</p>}
                    </div>
                    <Switch checked={p.activa} onCheckedChange={() => toggleActiva(p)} />
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{descripcionHorario(p)}</span>
                    </div>
                    {(p.fecha_desde || p.fecha_hasta) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {p.fecha_desde ? `desde ${p.fecha_desde}` : 'sin inicio'}
                          {' — '}
                          {p.fecha_hasta ? `hasta ${p.fecha_hasta}` : 'sin fin'}
                        </span>
                      </div>
                    )}
                    {nomServ.length > 0 ? (
                      <div className="text-muted-foreground">
                        <strong>Servicios:</strong> {nomServ.slice(0, 3).join(', ')}{nomServ.length > 3 && ` +${nomServ.length - 3}`}
                      </div>
                    ) : (
                      <div className="text-muted-foreground italic">Aplica a todos los servicios</div>
                    )}
                    {nomProf.length > 0 && (
                      <div className="text-muted-foreground">
                        <strong>Profesionales:</strong> {nomProf.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="flex-1 gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar promo' : 'Nueva promo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Imagen del cartel (opcional) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5" />
                Imagen del cartel (opcional)
              </Label>
              {form.imagen_url ? (
                <div className="relative rounded-lg border overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imagen_url} alt="Cartel" className="w-full max-h-72 object-contain" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1 h-7 text-xs shadow"
                      onClick={() => imagenInputRef.current?.click()}
                      disabled={uploadingImagen}
                    >
                      {uploadingImagen ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                      Cambiar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1 h-7 text-xs shadow"
                      onClick={handleQuitarImagen}
                      disabled={uploadingImagen}
                    >
                      <X className="h-3 w-3" />
                      Quitar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imagenInputRef.current?.click()}
                  disabled={uploadingImagen}
                  className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/60 hover:border-muted-foreground/50 transition-colors py-8 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground"
                >
                  {uploadingImagen ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                  <span className="font-medium">
                    {uploadingImagen ? 'Subiendo...' : 'Subir imagen del cartel'}
                  </span>
                  <span className="text-[10px]">JPG, PNG o WEBP · hasta 5MB</span>
                </button>
              )}
              <input
                ref={imagenInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagenUpload}
              />
              <p className="text-[11px] text-muted-foreground">
                Si subís una imagen, reemplaza el banner de texto en el sitio de reservas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Happy Hour Miércoles" />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: 20% off todos los miércoles de 14 a 17hs" />
            </div>

            {/* Tipo de descuento */}
            <div className="space-y-1.5">
              <Label>Tipo de descuento</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setForm({ ...form, tipo_descuento: 'pct' })}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${form.tipo_descuento === 'pct' ? 'bg-fuchsia-500 border-fuchsia-500 text-white' : 'border-border hover:bg-muted'}`}
                >
                  % uniforme
                </button>
                <button
                  onClick={() => setForm({ ...form, tipo_descuento: 'monto' })}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${form.tipo_descuento === 'monto' ? 'bg-fuchsia-500 border-fuchsia-500 text-white' : 'border-border hover:bg-muted'}`}
                >
                  $ fijo uniforme
                </button>
                <button
                  onClick={() => setForm({ ...form, tipo_descuento: 'override' })}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${form.tipo_descuento === 'override' ? 'bg-fuchsia-500 border-fuchsia-500 text-white' : 'border-border hover:bg-muted'}`}
                >
                  Precio por servicio
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <strong>% uniforme:</strong> mismo % para todos los servicios elegidos ·{' '}
                <strong>$ fijo:</strong> mismo monto en pesos ·{' '}
                <strong>Precio por servicio:</strong> precio final distinto para cada uno (ej: Happy Hour)
              </p>
            </div>

            {form.tipo_descuento !== 'override' && (
              <div className="space-y-1.5">
                <Label>{form.tipo_descuento === 'pct' ? 'Porcentaje de descuento' : 'Monto a descontar en pesos'}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.descuento_valor}
                  onChange={(e) => setForm({ ...form, descuento_valor: e.target.value })}
                  placeholder={form.tipo_descuento === 'pct' ? '20' : '5000'}
                />
              </div>
            )}

            {/* Método de pago requerido (ej: "solo abonando en efectivo") */}
            <div className="space-y-1.5">
              <Label>Método de pago requerido (opcional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: '', label: 'Cualquiera' },
                  { v: 'efectivo', label: 'Solo efectivo' },
                  { v: 'mercadopago', label: 'Solo MercadoPago' },
                  { v: 'transferencia', label: 'Solo transferencia' },
                ].map(m => (
                  <button
                    key={m.v}
                    onClick={() => setForm({ ...form, metodo_pago_requerido: m.v as any })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.metodo_pago_requerido === m.v
                        ? 'bg-fuchsia-500 border-fuchsia-500 text-white'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Días de la semana */}
            <div className="space-y-1.5">
              <Label>Días de la semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(d => (
                  <button
                    key={d.n}
                    onClick={() => toggleDia(d.n)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.dias_semana.includes(d.n)
                        ? 'bg-fuchsia-500 border-fuchsia-500 text-white'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Si no elegís ninguno, aplica todos los días.
              </p>
            </div>

            {/* Franja horaria */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hora desde (opcional)</Label>
                <Input type="time" value={form.hora_desde} onChange={(e) => setForm({ ...form, hora_desde: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora hasta (opcional)</Label>
                <Input type="time" value={form.hora_hasta} onChange={(e) => setForm({ ...form, hora_hasta: e.target.value })} />
              </div>
            </div>

            {/* Vigencia */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vigente desde (opcional)</Label>
                <Input type="date" value={form.fecha_desde} onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vigente hasta (opcional)</Label>
                <Input type="date" value={form.fecha_hasta} onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })} />
              </div>
            </div>

            {/* Servicios */}
            <div className="space-y-1.5">
              <Label>
                Servicios que aplican{' '}
                <span className="text-muted-foreground font-normal">
                  ({form.tipo_descuento === 'override'
                    ? Object.keys(form.precios_override).length + ' con precio promo'
                    : form.servicios_ids.length === 0 ? 'todos' : form.servicios_ids.length + ' elegidos'})
                </span>
              </Label>

              {/* Buscador */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar servicio..."
                  value={busquedaServicios}
                  onChange={(e) => setBusquedaServicios(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {(() => {
                const term = busquedaServicios.trim().toLowerCase()
                const filtrados = term ? servicios.filter(s => s.nombre.toLowerCase().includes(term)) : servicios

                // Ordenar: primero los seleccionados, después el resto
                const isSelected = (id: string) => form.tipo_descuento === 'override'
                  ? id in form.precios_override
                  : form.servicios_ids.includes(id)
                const ordenados = [...filtrados].sort((a, b) => {
                  const sa = isSelected(a.id) ? 0 : 1
                  const sb = isSelected(b.id) ? 0 : 1
                  return sa - sb
                })

                if (ordenados.length === 0) {
                  return (
                    <div className="max-h-60 rounded border p-4 text-center text-xs text-muted-foreground">
                      No hay servicios que coincidan con &quot;{busquedaServicios}&quot;
                    </div>
                  )
                }

                return (
                  <div className="max-h-60 overflow-y-auto rounded border p-2 space-y-1">
                    {ordenados.map(s => {
                      const inList = isSelected(s.id)
                      return (
                        <label key={s.id} className={`flex items-center gap-2 text-xs py-1.5 px-1 rounded cursor-pointer transition-colors ${
                          inList ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30' : 'hover:bg-muted/50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={inList}
                            onChange={() => {
                              if (form.tipo_descuento === 'override') {
                                const copy = { ...form.precios_override }
                                if (s.id in copy) delete copy[s.id]
                                else copy[s.id] = ''
                                setForm({ ...form, precios_override: copy })
                              } else {
                                toggleServicio(s.id)
                              }
                            }}
                            className="rounded"
                          />
                          <span className="flex-1">{s.nombre}</span>
                          <span className="text-muted-foreground tabular-nums text-[10px]">
                            ${Number(s.precio_efectivo || 0).toLocaleString('es-AR')}
                          </span>
                          {form.tipo_descuento === 'override' && inList && (
                            <>
                              <span className="text-muted-foreground">→</span>
                              <Input
                                type="number"
                                inputMode="numeric"
                                className="h-7 w-24 text-xs tabular-nums"
                                placeholder="promo"
                                value={form.precios_override[s.id] || ''}
                                onChange={(e) => setForm({
                                  ...form,
                                  precios_override: { ...form.precios_override, [s.id]: e.target.value },
                                })}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Profesionales */}
            <div className="space-y-1.5">
              <Label>Profesionales que aplican <span className="text-muted-foreground font-normal">({form.profesionales_ids.length === 0 ? 'todas' : form.profesionales_ids.length + ' elegidas'})</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {profesionales.map(p => (
                  <button
                    key={p.id}
                    onClick={() => toggleProfesional(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.profesionales_ids.includes(p.id)
                        ? 'text-white border-transparent'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                    style={form.profesionales_ids.includes(p.id) ? { backgroundColor: p.color } : undefined}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Activa */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch checked={form.activa} onCheckedChange={(v) => setForm({ ...form, activa: v })} />
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, activa: !form.activa })}>
                Activa (visible en /reservar)
              </Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.id ? 'Guardar cambios' : 'Crear promo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
