'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { Clock, Banknote, ChevronRight, ArrowLeft, Search } from 'lucide-react'
import Image from 'next/image'

export default function ReservarPage() {
  const router = useRouter()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedServicio, setSelectedServicio] = useState<string | null>(null)
  const [selectedProfesional, setSelectedProfesional] = useState<string | null>(null)
  const [filteredProfs, setFilteredProfs] = useState<Profesional[]>([])
  const [categoria, setCategoria] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const categorias = [
    { key: 'todos', label: 'Todos' },
    { key: 'promos', label: '🏷️ Promos' },
    { key: 'manos', label: 'Manos' },
    { key: 'pies', label: 'Pies' },
    { key: 'pestanas', label: 'Pestañas' },
    { key: 'cejas', label: 'Cejas' },
  ]

  function getCategoria(nombre: string): string {
    const n = nombre.toLowerCase()
    if (n.includes('pesta') || n.includes('lifting') || n.includes('botox') || n.includes('rimmel') || n.includes('2d') || n.includes('3d') || n.includes('mega volumen') || n.includes('retirado de maquillaje')) return 'pestanas'
    if (n.includes('ceja') || n.includes('henna') || n.includes('laminado') || n.includes('perfilado')) return 'cejas'
    if (n.includes('pies') || n.includes('belleza de pie')) return 'pies'
    if (n.includes('manos') || n.includes('kapping') || n.includes('semi') || n.includes('esmaltado') || n.includes('remocion') || n.includes('acrilico') || n.includes('gel')) return 'manos'
    return 'otros'
  }

  const categoriaIcon: Record<string, string> = {
    manos: '/icons/mano.jpg',
    pies: '/icons/pies.jpg',
    pestanas: '/icons/pestana.jpg',
    cejas: '/icons/ceja.jpg',
  }

  // Top 5 más solicitados globalmente (rank 0=más popular)
  const top5RankMap = (() => {
    const sorted = [...servicios].sort((a, b) => (bookingCounts[b.id] || 0) - (bookingCounts[a.id] || 0))
    return new Map(sorted.slice(0, 5).map((s, i) => [s.id, i]))
  })()

  const filteredServicios = servicios
    .filter((s) => {
      if (categoria === 'promos') return s.es_promo || /^promo/i.test(s.nombre)
      if (categoria !== 'todos' && getCategoria(s.nombre) !== categoria) return false
      if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const aRank = top5RankMap.get(a.id)
      const bRank = top5RankMap.get(b.id)

      // 1. Top 5 primero, en orden de demanda
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank
      if (aRank !== undefined) return -1
      if (bRank !== undefined) return 1

      // 2. Nombres que empiezan con dígito al final
      const aIsNum = /^\d/.test(a.nombre)
      const bIsNum = /^\d/.test(b.nombre)
      if (aIsNum !== bIsNum) return aIsNum ? 1 : -1

      // 3. Alfabético
      return a.nombre.localeCompare(b.nombre, 'es')
    })

  useEffect(() => {
    async function fetchData() {
      const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

      // Intentar cargar desde cache primero
      try {
        const cached = localStorage.getItem('reservar_cache')
        if (cached) {
          const { servicios: cachedServ, profesionales: cachedProf, counts: cachedCounts, ts } = JSON.parse(cached)
          if (Date.now() - ts < CACHE_TTL) {
            setServicios(cachedServ)
            setProfesionales(cachedProf)
            setBookingCounts(cachedCounts)
            setLoading(false)
            return
          }
        }
      } catch {}

      // Cargar servicios y profesionales primero (rápido, muestra la UI)
      const [servRes, profRes] = await Promise.all([
        supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
        supabase.from('profesionales').select('*').eq('activo', true).eq('visible_calendario', true).order('orden').order('nombre'),
      ])

      if (servRes.data) setServicios(servRes.data)
      if (profRes.data) setProfesionales(profRes.data)
      setLoading(false)

      // Cargar citas en segundo plano (no bloquea la UI)
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const citasRes = await supabase
        .from('citas')
        .select('servicio_id')
        .gte('fecha_inicio', sixtyDaysAgo.toISOString())
        .in('status', ['completada', 'confirmada', 'pendiente'])
        .not('servicio_id', 'is', null)

      const counts: Record<string, number> = {}
      for (const c of citasRes.data || []) {
        if (c.servicio_id) counts[c.servicio_id] = (counts[c.servicio_id] || 0) + 1
      }
      setBookingCounts(counts)

      // Guardar en cache
      try {
        localStorage.setItem('reservar_cache', JSON.stringify({
          servicios: servRes.data,
          profesionales: profRes.data,
          counts,
          ts: Date.now(),
        }))
      } catch {}
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

      {/* Step 1: Service list */}
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
          {!loading && filteredServicios.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedServicio(s.id)}
              className="w-full rounded-xl border border-gray-900 bg-white p-4 text-left transition-all hover:border-fuchsia-500 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-50 overflow-hidden">
                  <Image
                    src={categoriaIcon[getCategoria(s.nombre)] || '/icons/mano.jpg'}
                    alt={getCategoria(s.nombre)}
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
          ))}
          </div>
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
                src={categoriaIcon[getCategoria(selectedServ?.nombre || '')] || '/icons/mano.jpg'}
                alt={getCategoria(selectedServ?.nombre || '')}
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
