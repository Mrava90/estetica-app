'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { NailIcon } from '@/components/reservar/ReservarHeader'
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
  const supabase = createClient()

  const categorias = [
    { key: 'todos', label: 'Todos' },
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

  const filteredServicios = servicios.filter((s) => {
    if (categoria !== 'todos' && getCategoria(s.nombre) !== categoria) return false
    if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  useEffect(() => {
    async function fetchData() {
      const [servRes, profRes] = await Promise.all([
        supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
        supabase.from('profesionales').select('*').eq('activo', true).order('nombre'),
      ])
      if (servRes.data) setServicios(servRes.data)
      if (profRes.data) setProfesionales(profRes.data)
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

  function handleContinue() {
    if (!selectedServicio) return
    const params = new URLSearchParams({ servicio: selectedServicio })
    if (selectedProfesional) params.set('profesional', selectedProfesional)
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
          className="inline-block h-12 w-12 rounded-full object-cover mb-3"
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categorias.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategoria(c.key)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
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
          {filteredServicios.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedServicio(s.id)}
              className="w-full rounded-xl border border-gray-900 bg-white p-4 text-left transition-all hover:border-fuchsia-500 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600">
                  <NailIcon className="h-5 w-5" />
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-500 text-white">
              <NailIcon className="h-5 w-5" />
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

          {/* Professional pills */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white drop-shadow-md">Profesional (opcional)</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedProfesional(null)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  !selectedProfesional
                    ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-md'
                    : 'border-gray-900 bg-white text-gray-700 hover:border-fuchsia-500'
                }`}
              >
                Sin preferencia
              </button>
              {filteredProfs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfesional(p.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    selectedProfesional === p.id
                      ? 'border-fuchsia-500 bg-fuchsia-500 text-white shadow-md'
                      : 'border-gray-900 bg-white text-gray-700 hover:border-fuchsia-500'
                  }`}
                >
                  <div
                    className="h-4 w-4 rounded-full border border-white/50"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Spacer for sticky button */}
          <div className="h-20" />

          {/* Sticky continue button */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-4 pb-5 pt-8">
            <div className="mx-auto max-w-2xl">
              <button
                onClick={handleContinue}
                className="w-full rounded-xl bg-black py-4 text-center text-base font-semibold text-white transition-all hover:bg-gray-900 shadow-lg"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
