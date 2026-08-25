'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora, formatPrecio, capitalizeWords } from '@/lib/dates'
import type { Servicio, Profesional, Promocion } from '@/types/database'
import { NailIcon } from '@/components/reservar/ReservarHeader'
import { ArrowLeft, CalendarDays, User, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { calcularPrecioConPromo, descripcionDescuento } from '@/lib/promociones'

function ConfirmarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const servicioId = searchParams.get('servicio')
  const profesionalId = searchParams.get('profesional')
  const fechaInicio = searchParams.get('inicio')
  const fechaFin = searchParams.get('fin')

  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [profesional, setProfesional] = useState<Profesional | null>(null)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [dni, setDni] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [telLookupLoading, setTelLookupLoading] = useState(false)
  const [clienteEncontrado, setClienteEncontrado] = useState(false)
  const [promos, setPromos] = useState<Promocion[]>([])
  const supabase = createClient()

  function normalizarTelefono(tel: string): string {
    let t = tel.trim().replace(/\D/g, '') // solo dígitos
    if (t.startsWith('5491'))  t = t.slice(4)   // 5491164... → 164...  (luego agrega 11)
    else if (t.startsWith('549')) t = t.slice(3) // 549164... → 164...
    else if (t.startsWith('54'))  t = t.slice(2) // 541164... → 1164...
    if (t.startsWith('15'))    t = '11' + t.slice(2) // 15... → 11...
    if (!t.startsWith('11') && t.length === 8) t = '11' + t // 64316074 → 1164316074
    return t
  }

  async function buscarPorTelefono(tel: string) {
    if (tel.length < 8) return
    setTelLookupLoading(true)
    setClienteEncontrado(false)
    try {
      const res = await fetch(`/api/reservar/booking?telefono=${encodeURIComponent(tel)}`)
      const data = await res.json()
      // Por seguridad el endpoint publico solo devuelve `nombre` (para saludo).
      // Email/apellido/DNI ya no vienen — el cliente los ingresa manualmente si los quiere completar.
      if (data.found) {
        if (data.nombre) setNombre(data.nombre)
        setClienteEncontrado(true)
      }
    } finally {
      setTelLookupLoading(false)
    }
  }

  useEffect(() => {
    if (!servicioId || !profesionalId || !fechaInicio || !fechaFin) {
      router.push('/reservar')
      return
    }
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [servRes, profRes, promosRes] = await Promise.all([
      supabase.from('servicios').select('*').eq('id', servicioId).single(),
      supabase.from('profesionales').select('*').eq('id', profesionalId).single(),
      fetch('/api/promociones/activas').then(r => r.ok ? r.json() : { items: [] }),
    ])
    if (servRes.data) setServicio(servRes.data)
    if (profRes.data) setProfesional(profRes.data)
    if (promosRes?.items) setPromos(promosRes.items as Promocion[])
  }

  async function handleConfirm() {
    if (!nombre.trim() || !telefono.trim()) {
      toast.error('Completá nombre y teléfono')
      return
    }
    if (telefono.length < 8) {
      toast.error('El teléfono debe tener al menos 8 dígitos')
      return
    }

    setLoading(true)
    try {
      const reprogramarId = searchParams.get('reprogramar')
      const res = await fetch('/api/reservar/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre, apellido, telefono, dni, email,
          servicioId, profesionalId, fechaInicio, fechaFin,
          ...(reprogramarId ? { reprogramarId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.citaId) {
        toast.error(data.error || 'Error al confirmar la cita.')
        return
      }

      const exitoParams = new URLSearchParams({ fecha: fechaInicio!, cita: data.citaId, nombre: capitalizeWords(nombre) })
      if (email.trim()) exitoParams.set('email', email.trim().toLowerCase())
      router.push(`/reservar/exito?${exitoParams.toString()}`)
    } catch {
      toast.error('Error al confirmar la cita. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (!servicio || !profesional || !fechaInicio) {
    return <div className="text-center text-gray-400 py-12">Cargando...</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-lg font-bold text-white drop-shadow-md">Confirmar turno</h1>
      </div>

      {/* Summary compacto */}
      <div className="rounded-xl border border-gray-900 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <NailIcon className="h-4 w-4 text-fuchsia-500 shrink-0" />
            <span className="text-sm font-semibold text-gray-900">{servicio.nombre}</span>
            <span className="text-xs text-gray-400">{servicio.duracion_minutos} min</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{profesional.nombre}</span>
            <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatFechaHora(fechaInicio)}</span>
          </div>
        </div>
      </div>

      {/* Cartel de promo aplicada */}
      {(() => {
        if (!servicio || !fechaInicio || promos.length === 0) return null
        const precioInfo = calcularPrecioConPromo({
          precioBase: servicio.precio_efectivo || 0,
          promociones: promos,
          fechaInicio: fechaInicio,
          servicioId: servicio.id,
          profesionalId: profesional.id,
          metodoPago: 'efectivo',
        })
        if (!precioInfo.promocionAplicada || precioInfo.descuento <= 0) return null
        const p = precioInfo.promocionAplicada
        return (
          <div className="rounded-xl border-2 border-fuchsia-400 bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-3 text-white shadow-lg">
            <div className="flex items-start gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">¡Se aplicó una promoción! 🎉</p>
                <p className="text-xs text-white/90 mt-0.5">
                  <strong>{p.nombre}</strong> ({descripcionDescuento(p)})
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="line-through text-white/70 text-sm">{formatPrecio(precioInfo.precioOriginal)}</span>
                  <span className="text-2xl font-bold">{formatPrecio(precioInfo.precioFinal)}</span>
                  <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">
                    ahorrás {formatPrecio(precioInfo.descuento)}
                  </span>
                </div>
                {p.metodo_pago_requerido && (
                  <p className="text-[11px] text-white/80 mt-1.5">
                    ⚠️ El descuento aplica solo pagando en <strong>{p.metodo_pago_requerido}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Teléfono primero */}
      <div className="rounded-xl border border-gray-900 bg-white px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Celular</label>
          {telLookupLoading && <span className="text-[10px] text-fuchsia-500 animate-pulse">Buscando...</span>}
          {clienteEncontrado && !telLookupLoading && <span className="text-[10px] text-green-600 font-medium">✓ Datos cargados</span>}
        </div>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="1112345678"
          value={telefono}
          onChange={(e) => { setTelefono(e.target.value); setClienteEncontrado(false) }}
          onBlur={(e) => buscarPorTelefono(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
        />
      </div>

      {/* Resto de datos */}
      <div className="rounded-xl border border-gray-900 bg-white px-4 py-3 space-y-2.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tus datos</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Nombre</label>
            <input
              type="text"
              placeholder="Tu nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Apellido</label>
            <input
              type="text"
              placeholder="Tu apellido"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">DNI</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="35123456"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Email <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={loading || !nombre.trim() || !telefono.trim()}
        className="w-full rounded-xl bg-black py-3 text-center text-base font-semibold text-white transition-all hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        {loading ? 'Confirmando...' : 'Confirmar turno'}
      </button>
    </div>
  )
}

export default function ConfirmarPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400 py-12">Cargando...</div>}>
      <ConfirmarContent />
    </Suspense>
  )
}
