'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatFechaHora } from '@/lib/dates'
import type { CitaConRelaciones } from '@/types/database'
import { CalendarDays, Mail, CheckCircle, X } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'

const TOKEN_KEY = 'mt_token'

type Estado = 'loading' | 'sin-token' | 'sin-turnos' | 'ok' | 'expirado'

function MisTurnosContent() {
  const searchParams = useSearchParams()
  const [estado, setEstado] = useState<Estado>('loading')
  const [citas, setCitas] = useState<CitaConRelaciones[]>([])
  const [clienteEmail, setClienteEmail] = useState('')
  const [token, setToken] = useState('')
  const [inputEmail, setInputEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [linkEnviado, setLinkEnviado] = useState(false)
  const [errorEmail, setErrorEmail] = useState('')
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    const urlToken = searchParams.get('token')
    const savedToken = localStorage.getItem(TOKEN_KEY)
    const activeToken = urlToken || savedToken || ''

    if (!activeToken) {
      setEstado('sin-token')
      return
    }

    if (urlToken) localStorage.setItem(TOKEN_KEY, urlToken)
    setToken(activeToken)
    loadCitas(activeToken)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCitas(t: string) {
    const res = await fetch(`/api/mis-turnos?token=${t}`)
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      setEstado('expirado')
      return
    }
    const { citas: data, cliente } = await res.json()
    if (cliente?.email) setClienteEmail(cliente.email)
    if (!data || data.length === 0) {
      setEstado('sin-turnos')
    } else {
      setCitas(data)
      setEstado('ok')
    }
  }

  async function handleSendLink() {
    if (!inputEmail.trim() || !inputEmail.includes('@')) {
      setErrorEmail('Ingresá un email válido')
      return
    }
    setEnviando(true)
    setErrorEmail('')
    const res = await fetch('/api/mis-turnos/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inputEmail.trim().toLowerCase() }),
    })
    setEnviando(false)
    if (!res.ok) {
      setErrorEmail('No se pudo enviar el link. Intentá de nuevo.')
    } else {
      setLinkEnviado(true)
    }
  }

  async function handleCancelar(citaId: string) {
    setCancelando(citaId)
    setCancelError(null)
    const res = await fetch('/api/mis-turnos/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citaId, token }),
    })
    const data = await res.json()
    setCancelando(null)
    if (!res.ok) {
      setCancelError(data.error || 'Error al cancelar')
    } else {
      setCitas((prev) => prev.map((c) => c.id === citaId ? { ...c, status: 'cancelada' } : c))
    }
  }

  function handleSalir() {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setCitas([])
    setEstado('sin-token')
  }

  if (estado === 'loading') {
    return <div className="text-center text-white/70 py-16">Cargando...</div>
  }

  if (estado === 'sin-token' || estado === 'expirado') {
    return (
      <div className="flex flex-col items-center space-y-6 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-100">
          <Mail className="h-8 w-8 text-fuchsia-600" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white drop-shadow-md">Mis turnos</h1>
          <p className="text-sm text-white/80">
            {estado === 'expirado'
              ? 'El link expiró. Pedí uno nuevo.'
              : 'Ingresá tu email para recibir un link de acceso'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-900 bg-white p-5 w-full max-w-sm space-y-4">
          {linkEnviado ? (
            <div className="text-center space-y-2 py-2">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium text-green-700">¡Link enviado!</p>
              <p className="text-xs text-gray-500">Revisá tu email para acceder a tus turnos</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={inputEmail}
                  onChange={(e) => { setInputEmail(e.target.value); setErrorEmail('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendLink()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
                />
                {errorEmail && <p className="text-xs text-red-500">{errorEmail}</p>}
              </div>
              <button
                onClick={handleSendLink}
                disabled={enviando}
                className="w-full rounded-lg bg-fuchsia-600 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50 transition-all"
              >
                {enviando ? 'Enviando...' : 'Recibir link de acceso'}
              </button>
            </>
          )}
        </div>
        <Link href="/reservar" className="text-sm text-white/70 hover:text-white underline">
          Reservar un turno
        </Link>
      </div>
    )
  }

  if (estado === 'sin-turnos') {
    return (
      <div className="flex flex-col items-center space-y-5 py-8">
        <h1 className="text-2xl font-bold text-white drop-shadow-md">Mis turnos</h1>
        <div className="rounded-xl border border-gray-900 bg-white p-6 text-center w-full max-w-sm space-y-2">
          <p className="text-sm font-medium text-gray-700">No encontramos turnos asociados a tu cuenta.</p>
          <p className="text-xs text-gray-500">Si reservaste con otro email, solicitá acceso con ese email.</p>
        </div>
        <button onClick={handleSalir} className="text-sm text-white/70 hover:text-white underline">
          Usar otro email
        </button>
        <Link href="/reservar" className="rounded-xl bg-black px-8 py-3 text-sm font-semibold text-white hover:bg-gray-900 shadow-lg">
          Reservar un turno
        </Link>
      </div>
    )
  }

  const proximos = citas.filter((c) => new Date(c.fecha_inicio) >= new Date() && c.status !== 'cancelada' && c.status !== 'completada')
  const pasados = citas.filter((c) => new Date(c.fecha_inicio) < new Date() || c.status === 'cancelada' || c.status === 'completada')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white drop-shadow-md">Mis turnos</h1>
          {clienteEmail && <p className="text-xs text-white/70 mt-0.5">{clienteEmail}</p>}
        </div>
        <button onClick={handleSalir} className="text-xs text-white/70 hover:text-white underline">
          Salir
        </button>
      </div>

      {cancelError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {cancelError}
        </div>
      )}

      {proximos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Próximos</h2>
          {proximos.map((c) => (
            <CitaCard key={c.id} cita={c} onCancelar={handleCancelar} cancelando={cancelando} />
          ))}
        </div>
      )}

      {proximos.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white/90 p-5 text-center space-y-3">
          <p className="text-sm text-gray-600">No tenés turnos próximos</p>
          <Link href="/reservar" className="inline-block rounded-lg bg-black px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-900">
            Reservar turno
          </Link>
        </div>
      )}

      {pasados.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Historial</h2>
          {pasados.map((c) => (
            <CitaCard key={c.id} cita={c} onCancelar={handleCancelar} cancelando={cancelando} readonly />
          ))}
        </div>
      )}
    </div>
  )
}

function CitaCard({
  cita,
  onCancelar,
  cancelando,
  readonly = false,
}: {
  cita: CitaConRelaciones
  onCancelar: (id: string) => void
  cancelando: string | null
  readonly?: boolean
}) {
  const [confirmando, setConfirmando] = useState(false)
  const isPasado = new Date(cita.fecha_inicio) < new Date()
  const isCancelado = cita.status === 'cancelada'
  const isCompletado = cita.status === 'completada'
  const horasRestantes = (new Date(cita.fecha_inicio).getTime() - Date.now()) / (1000 * 60 * 60)
  const puedeCancelar = !isPasado && !isCancelado && !isCompletado && horasRestantes >= 24

  return (
    <div className={`rounded-xl border bg-white p-4 space-y-3 ${isCancelado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1 min-w-0">
          {cita.servicios && (
            <p className="text-sm font-semibold text-gray-900 truncate">{cita.servicios.nombre}</p>
          )}
          {cita.profesionales && (
            <div className="flex items-center gap-1.5">
              {cita.profesionales.foto_url ? (
                <Image src={cita.profesionales.foto_url} alt={cita.profesionales.nombre} width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: cita.profesionales.color }}>
                  {cita.profesionales.nombre.charAt(0)}
                </div>
              )}
              <span className="text-xs text-gray-600">{cita.profesionales.nombre}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {formatFechaHora(cita.fecha_inicio)}
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
          isCancelado ? 'bg-red-100 text-red-700' :
          isCompletado ? 'bg-green-100 text-green-700' :
          cita.status === 'confirmada' ? 'bg-blue-100 text-blue-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {isCancelado ? 'Cancelado' : isCompletado ? 'Completado' : cita.status === 'confirmada' ? 'Confirmado' : 'Pendiente'}
        </span>
      </div>

      {!readonly && puedeCancelar && (
        confirmando ? (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { onCancelar(cita.id); setConfirmando(false) }}
              disabled={cancelando === cita.id}
              className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-all"
            >
              {cancelando === cita.id ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              Volver
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Cancelar turno
          </button>
        )
      )}

      {!readonly && !puedeCancelar && !isPasado && !isCancelado && !isCompletado && (
        <p className="text-xs text-gray-400">No se puede cancelar con menos de 24hs de anticipación</p>
      )}
    </div>
  )
}

export default function MisTurnosPage() {
  return (
    <Suspense fallback={<div className="text-center text-white/70 py-16">Cargando...</div>}>
      <MisTurnosContent />
    </Suspense>
  )
}
