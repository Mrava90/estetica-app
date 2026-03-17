'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatFechaHora, formatPrecio, capitalizeWords } from '@/lib/dates'
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
  const [apellido, setApellido] = useState('')
  const [dni, setDni] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
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
          nombre: capitalizeWords(nombre),
          apellido: apellido.trim() ? capitalizeWords(apellido) : null,
          ...(dni.trim() ? { dni: dni.trim() } : {}),
          ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
        }).eq('id', clienteId)
      } else {
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({ nombre: capitalizeWords(nombre), apellido: apellido.trim() ? capitalizeWords(apellido) : null, telefono, ...(dni.trim() ? { dni: dni.trim() } : {}), ...(email.trim() ? { email: email.trim().toLowerCase() } : {}) })
          .select('id')
          .single()
        if (clienteError || !newCliente) throw clienteError
        clienteId = newCliente.id
      }

      const { data: citaData, error: citaError } = await supabase.from('citas').insert({
        cliente_id: clienteId,
        profesional_id: profesionalId,
        servicio_id: servicioId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        precio_cobrado: servicio?.precio_efectivo || null,
        origen: 'online',
        status: 'pendiente',
      }).select('id').single()

      if (citaError) throw citaError

      // Si es reprogramación, cancelar la cita original
      const reprogramarId = searchParams.get('reprogramar')
      if (reprogramarId) {
        await supabase.from('citas').update({ status: 'cancelada' }).eq('id', reprogramarId)
      }

      const exitoParams = new URLSearchParams({ fecha: fechaInicio!, cita: citaData.id })
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

      {/* Client info form */}
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
            <label className="text-xs font-medium text-gray-600">Teléfono (WhatsApp)</label>
            <input
              type="tel"
              placeholder="1112345678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Email <span className="text-gray-400 font-normal">(opcional — para gestionar tus turnos)</span></label>
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
          />
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
