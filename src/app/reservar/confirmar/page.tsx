'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora, formatPrecio } from '@/lib/dates'
import type { Servicio, Profesional } from '@/types/database'
import { NailIcon } from '@/components/reservar/ReservarHeader'
import { ArrowLeft, CalendarDays, User } from 'lucide-react'
import { toast } from 'sonner'

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
  const [dni, setDni] = useState('')
  const [telefono, setTelefono] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!servicioId || !profesionalId || !fechaInicio || !fechaFin) {
      router.push('/reservar')
      return
    }
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [servRes, profRes] = await Promise.all([
      supabase.from('servicios').select('*').eq('id', servicioId).single(),
      supabase.from('profesionales').select('*').eq('id', profesionalId).single(),
    ])
    if (servRes.data) setServicio(servRes.data)
    if (profRes.data) setProfesional(profRes.data)
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
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefono', telefono)
        .single()

      let clienteId: string

      if (existingCliente) {
        clienteId = existingCliente.id
        // Update name and DNI if provided
        await supabase.from('clientes').update({
          nombre,
          ...(dni.trim() ? { dni: dni.trim() } : {}),
        }).eq('id', clienteId)
      } else {
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({ nombre, telefono, ...(dni.trim() ? { dni: dni.trim() } : {}) })
          .select('id')
          .single()
        if (clienteError || !newCliente) throw clienteError
        clienteId = newCliente.id
      }

      const { error: citaError } = await supabase.from('citas').insert({
        cliente_id: clienteId,
        profesional_id: profesionalId,
        servicio_id: servicioId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        precio_cobrado: servicio?.precio_efectivo || null,
        origen: 'online',
        status: 'pendiente',
      })

      if (citaError) throw citaError

      router.push(`/reservar/exito?fecha=${fechaInicio}`)
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
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-fuchsia-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Confirmar turno</h1>
        <p className="text-sm text-gray-500 mt-1">Revisá los datos y completá tu información</p>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-gray-900 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Resumen del turno</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100">
              <NailIcon className="h-4 w-4 text-fuchsia-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{servicio.nombre}</p>
              <p className="text-xs text-gray-500">
                {servicio.duracion_minutos} min — Efectivo {formatPrecio(servicio.precio_efectivo)} · P. Lista {formatPrecio(servicio.precio_mercadopago)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
              <User className="h-4 w-4 text-gray-600" />
            </div>
            <p className="text-sm text-gray-900">{profesional.nombre}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
              <CalendarDays className="h-4 w-4 text-gray-600" />
            </div>
            <p className="text-sm text-gray-900">{formatFechaHora(fechaInicio)}</p>
          </div>
        </div>
      </div>

      {/* Client info form */}
      <div className="rounded-xl border border-gray-900 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Tus datos</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nombre completo</label>
            <input
              type="text"
              placeholder="Tu nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">DNI</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 35123456"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Teléfono (WhatsApp)</label>
            <input
              type="tel"
              placeholder="Ej: 5491112345678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
            <p className="text-xs text-gray-400">
              Usaremos este número para confirmar tu turno por WhatsApp
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={loading || !nombre.trim() || !telefono.trim()}
        className="w-full rounded-xl bg-[#1C1C2E] py-4 text-center text-base font-semibold text-white transition-all hover:bg-[#2a2a42] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
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
