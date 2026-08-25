'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional, Promocion } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { Clock, Banknote, ChevronRight, ArrowLeft, Search, Sparkles, X } from 'lucide-react'
import Image from 'next/image'
import { getCategoria } from '@/lib/categorias'
import { promosDelDia, descripcionDescuento, descripcionHorario, promoAplica, calcularPrecioConPromo } from '@/lib/promociones'

export default function ReservarPage() {
  const router = useRouter()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedServicio, setSelectedServicio] = useState<string | null>(null)
  const [selectedProfesional, setSelectedProfesional] = useState<string | null>(null)
  const [filteredProfs, setFilteredProfs] = useState<Profesional[]>([])
  const [categoria, setCategoria] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [promos, setPromos] = useState<Promocion[]>([])
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  const supabase = createClient()

  // Re-render cada 60s para que las promos venzan automáticamente al pasar hora_hasta
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const categorias = [
    { key: 'todos', label: 'Todos' },
    { key: 'promos', label: '🏷️ Promos' },
    { key: 'manos', label: 'Manos' },
    { key: 'pies', label: 'Pies' },
    { key: 'pestanas', label: 'Pestañas' },
    { key: 'cejas', label: 'Cejas' },
  ]

  const categoriaIcon: Record<string, string> = {
    manos: '/icons/mano.jpg',
    pies: '/icons/pies.jpg',
    pestanas: '/icons/pestana.jpg',
    cejas: '/icons/ceja.jpg',
  }

  const filteredServicios = servicios
    .filter((s) => {
      if (categoria === 'promos') return s.es_promo || /^promo/i.test(s.nombre)
      if (categoria !== 'todos' && getCategoria(s.nombre, s.categoria) !== categoria) return false
      if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const aRank = (a as any).orden_reserva as number | null
      const bRank = (b as any).orden_reserva as number | null

      // 1. Top 5 primero, en orden precalculado
      if (aRank != null && bRank != null) return aRank - bRank
      if (aRank != null) return -1
      if (bRank != null) return 1

      // 2. Nombres que empiezan con dígito al final
      const aIsNum = /^\d/.test(a.nombre)
      const bIsNum = /^\d/.test(b.nombre)
      if (aIsNum !== bIsNum) return aIsNum ? 1 : -1

      // 3. Alfabético
      return a.nombre.localeCompare(b.nombre, 'es')
    })

  useEffect(() => {
    async function fetchData() {
      const [servRes, profRes, promosRes] = await Promise.all([
        supabase.from('servicios').select('*').eq('activo', true).order('orden_reserva', { ascending: true, nullsFirst: false }).order('nombre'),
        supabase.from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).order('orden').order('nombre'),
        fetch('/api/promociones/activas').then(r => r.ok ? r.json() : { items: [] }),
      ])

      if (servRes.data) setServicios(servRes.data)
      if (promosRes?.items) setPromos(promosRes.items as Promocion[])
      if (profRes.data) setProfesionales(profRes.data)
      setLoading(false)
    }
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedServicio) {
      setFilteredProfs([])
      return
    }
    async function fetchProfsForService() {
      const { data } = await supabase
        .from('profesional_servicios')
        .select('profesional_id')
        .eq('servicio_id', selectedServicio)
      if (data && data.length > 0) {
        const ids = data.map((d) => d.profesional_id)
        setFilteredProfs(profesionales.filter((p) => ids.includes(p.id)))
      } else {
        // No records = all professionals can do it (backwards compatible)
        setFilteredProfs(profesionales)
      }
    }
    fetchProfsForService()
    setSelectedProfesional(null)
  }, [selectedServicio, profesionales]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleContinue(profId?: string | null) {
    if (!selectedServicio) return
    const params = new URLSearchParams({ servicio: selectedServicio })
    if (profId) params.set('profesional', profId)
    router.push(`/reservar/horario?${params.toString()}`)
  }

  const selectedServ = servicios.find((s) => s.id === selectedServicio)

  // Promos activas HOY (para banner). Depende de `ahora` para venzan al pasar hora_hasta.
  const promosHoy = promosDelDia(promos, ahora)
  const promosHoyConImagen = promosHoy.filter(p => !!p.imagen_url)
  const promosHoySinImagen = promosHoy.filter(p => !p.imagen_url)

  // Servicios con al menos una promo aplicable en algún horario de hoy
  const servicioTienePromoHoy = (servicioId: string): boolean => {
    if (promosHoy.length === 0) return false
    // Test rápido: si alguna promo del día tiene ese servicio en scope (o aplica a todos)
    return promosHoy.some(p => {
      if (p.precios_override && Object.keys(p.precios_override).length > 0) {
        return servicioId in p.precios_override
      }
      if (p.servicios_ids && p.servicios_ids.length > 0) return p.servicios_ids.includes(servicioId)
      return true
    })
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <Image
          src="/logo-kawirth.png"
          alt="Ka Wirth"
          width={48}
          height={48}
          onClick={() => { setSelectedServicio(null); setSelectedProfesional(null); setCategoria('todos'); setBusqueda('') }}
          className="inline-block h-12 w-12 rounded-full object-cover mb-3 cursor-pointer"
        />
        <h1 className="text-2xl font-bold text-white drop-shadow-md">
          {selectedServicio ? 'Elegir profesional' : 'Elegir servicio'}
        </h1>
        <p className="text-sm text-white/80 mt-1">
          {selectedServicio ? 'Seleccioná quién te atiende (opcional)' : 'Seleccioná el servicio que querés'}
        </p>
      </div>

      {/* Banner de promos activas HOY sin imagen (banner de texto) */}
      {!selectedServicio && promosHoySinImagen.length > 0 && (
        <div className="space-y-2">
          {promosHoySinImagen.map(p => (
            <div key={p.id} className="rounded-xl border-2 border-fuchsia-400 bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-3 text-white shadow-lg">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="font-bold text-sm uppercase tracking-wide">{p.nombre}</p>
                    <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">
                      {descripcionDescuento(p)}
                    </span>
                  </div>
                  <p className="text-xs text-white/90 mt-0.5">
                    {descripcionHorario(p)}
                    {p.metodo_pago_requerido && <> · pagando en <strong>{p.metodo_pago_requerido}</strong></>}
                  </p>
                  {p.descripcion && <p className="text-[11px] text-white/80 mt-0.5">{p.descripcion}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Imágenes de promos:
          - Mobile/tablet: van arriba, en el flujo, centradas y más chicas (~65% del ancho)
          - xl (≥1280px): fijas a la izquierda del contenedor central, sin achicar servicios */}
      {!selectedServicio && promosHoyConImagen.length > 0 && (
        <div className="space-y-3 xl:hidden flex flex-col items-center">
          {promosHoyConImagen.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setImagenAmpliada(p.imagen_url!)}
              className="block w-2/3 max-w-[16rem] rounded-2xl overflow-hidden border-2 border-fuchsia-400 shadow-lg bg-white transition-transform hover:scale-[1.01] active:scale-95"
              aria-label={`Ver ${p.nombre} en grande`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imagen_url!}
                alt={p.nombre}
                className="w-full h-auto object-contain bg-fuchsia-500"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Panel fijo a la izquierda en desktop grande — NO achica el contenedor central.
          Sin scroll: la imagen se ajusta a la altura de la ventana con object-contain. */}
      {!selectedServicio && promosHoyConImagen.length > 0 && (
        <div className="hidden xl:block fixed left-6 top-24 w-[22rem] 2xl:w-[26rem] space-y-3 z-20">
          {promosHoyConImagen.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setImagenAmpliada(p.imagen_url!)}
              className="block w-full rounded-2xl overflow-hidden border-2 border-fuchsia-400 shadow-2xl bg-white transition-transform hover:scale-[1.01] active:scale-95"
              aria-label={`Ver ${p.nombre} en grande`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imagen_url!}
                alt={p.nombre}
                className="w-full h-auto max-h-[calc(100vh-8rem)] object-contain bg-fuchsia-500"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Service list — sin achicar */}
      {!selectedServicio && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex justify-center gap-1.5">
            {categorias.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategoria(c.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  categoria === c.key
                    ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-lg scale-105'
                    : 'border-white/50 bg-white/80 text-gray-700 shadow-sm hover:bg-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar servicio..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-xl border border-white/30 bg-white/90 backdrop-blur-sm py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
            />
          </div>

          {/* Service cards */}
          <div className="space-y-2">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-full rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-100" />
                  <div className="flex gap-3">
                    <div className="h-3 w-16 rounded bg-gray-100" />
                    <div className="h-3 w-20 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-5 w-5 rounded bg-gray-100" />
              </div>
            </div>
          ))}
          {!loading && filteredServicios.map((s) => {
            const tienePromo = servicioTienePromoHoy(s.id)
            return (
            <button
              key={s.id}
              onClick={() => setSelectedServicio(s.id)}
              className={`relative w-full rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                tienePromo
                  ? 'border-fuchsia-400 bg-gradient-to-br from-fuchsia-50 to-white hover:border-fuchsia-500'
                  : 'border-gray-900 bg-white hover:border-fuchsia-500'
              }`}
            >
              {tienePromo && (
                <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  <Sparkles className="h-3 w-3" />
                  PROMO HOY
                </span>
              )}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-50 overflow-hidden">
                  <Image
                    src={categoriaIcon[getCategoria(s.nombre, s.categoria)] || '/icons/mano.jpg'}
                    alt={getCategoria(s.nombre, s.categoria)}
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{s.nombre}</h3>
                  {s.descripcion && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{s.descripcion}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {s.duracion_minutos} min
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Banknote className="h-3 w-3" />
                      Efectivo {formatPrecio(s.precio_efectivo)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Banknote className="h-3 w-3" />
                      P. Lista {formatPrecio(s.precio_mercadopago)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
              </div>
            </button>
          )})}
          </div>
        </div>
      )}

      {/* Lightbox: imagen ampliada al hacer clic */}
      {imagenAmpliada && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setImagenAmpliada(null)}
        >
          <button
            type="button"
            onClick={() => setImagenAmpliada(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 backdrop-blur"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenAmpliada}
            alt="Promo ampliada"
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Step 2: Professional selection */}
      {selectedServicio && (
        <div className="space-y-5 animate-in fade-in-0 duration-200">
          {/* Selected service summary */}
          <button
            onClick={() => { setSelectedServicio(null); setSelectedProfesional(null) }}
            className="flex items-center gap-3 w-full rounded-xl border border-fuchsia-500 bg-white p-4 text-left ring-2 ring-fuchsia-500/20 shadow-md"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-fuchsia-500" />
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 overflow-hidden">
              <Image
                src={categoriaIcon[getCategoria(selectedServ?.nombre || '', selectedServ?.categoria)] || '/icons/mano.jpg'}
                alt={getCategoria(selectedServ?.nombre || '', selectedServ?.categoria)}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{selectedServ?.nombre}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  {selectedServ?.duracion_minutos} min
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Banknote className="h-3 w-3" />
                  {formatPrecio(selectedServ?.precio_efectivo || 0)}
                </span>
              </div>
            </div>
            <span className="text-xs text-fuchsia-500 font-medium shrink-0">Cambiar</span>
          </button>

          {/* Professional cards */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white drop-shadow-md">Profesional (opcional)</h2>
            <div className="grid grid-cols-3 gap-3">
              {filteredProfs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleContinue(p.id)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-gray-900 bg-white p-4 text-center transition-all hover:border-fuchsia-500 hover:shadow-md active:scale-95"
                >
                  <div className="h-16 w-16 rounded-full overflow-hidden border-2" style={{ borderColor: p.color }}>
                    {p.foto_url ? (
                      <Image
                        src={p.foto_url}
                        alt={p.nombre}
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: p.color }}>
                        {p.nombre.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{p.nombre}</span>
                </button>
              ))}

              {/* Sin preferencia - full width */}
              <button
                onClick={() => handleContinue(null)}
                className="col-span-3 flex items-center justify-center gap-3 rounded-2xl border border-gray-900 bg-white px-4 py-3 text-center transition-all hover:border-fuchsia-500 hover:shadow-md active:scale-95"
              >
                <span className="text-xl">✨</span>
                <span className="text-sm font-medium text-gray-700">Sin preferencia</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
