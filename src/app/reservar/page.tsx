'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Servicio, Profesional } from '@/types/database'
import { formatPrecio } from '@/lib/dates'
import { NailIcon } from '@/components/reservar/ReservarHeader'
import { Clock, Banknote, Smartphone, ChevronRight } from 'lucide-react'
import Image from 'next/image'

export default function ReservarPage() {
  const router = useRouter()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [selectedServicio, setSelectedServicio] = useState<string | null>(null)
  const [selectedProfesional, setSelectedProfesional] = useState<string | null>(null)
  const [filteredProfs, setFilteredProfs] = useState<Profesional[]>([])
  const supabase = createClient()

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
        <h1 className="text-2xl font-bold text-gray-900">Elegir servicio</h1>
        <p className="text-sm text-gray-500 mt-1">Seleccioná el servicio que querés</p>
      </div>

      {/* Service list */}
      <div className="space-y-2">
        {servicios.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedServicio(s.id)}
            className={`w-full rounded-xl border bg-white p-4 text-left transition-all ${
              selectedServicio === s.id
                ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/20 shadow-md'
                : 'border-gray-900 hover:border-fuchsia-500 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                selectedServicio === s.id ? 'bg-fuchsia-500 text-white' : 'bg-fuchsia-100 text-fuchsia-600'
              }`}>
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
              <ChevronRight className={`h-5 w-5 shrink-0 ${
                selectedServicio === s.id ? 'text-fuchsia-500' : 'text-gray-300'
              }`} />
            </div>
          </button>
        ))}
      </div>

      {/* Professional selection */}
      {selectedServicio && (
        <div className="space-y-3 animate-in slide-in-from-bottom-2 fade-in-0 duration-300">
          <h2 className="text-lg font-semibold text-gray-900">Profesional (opcional)</h2>
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
      )}

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!selectedServicio}
        className="w-full rounded-xl bg-[#1C1C2E] py-4 text-center text-base font-semibold text-white transition-all hover:bg-[#2a2a42] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        Continuar
      </button>
    </div>
  )
}
