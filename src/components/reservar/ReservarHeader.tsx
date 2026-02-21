'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function NailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Hand with painted nails */}
      <path d="M18 11V6a2 2 0 0 0-4 0v1" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8H12a8 8 0 0 1-6-2.7" />
      {/* Nail polish accent */}
      <circle cx="12" cy="4" r="0.5" fill="currentColor" />
      <circle cx="16" cy="6" r="0.5" fill="currentColor" />
      <circle cx="20" cy="8" r="0.5" fill="currentColor" />
    </svg>
  )
}

export { NailIcon }

export function ReservarHeader() {
  const [nombreSalon, setNombreSalon] = useState('Estética SR')

  useEffect(() => {
    async function fetchConfig() {
      const supabase = createClient()
      const { data } = await supabase.from('configuracion').select('nombre_salon').single()
      if (data) setNombreSalon(data.nombre_salon)
    }
    fetchConfig()
  }, [])

  return (
    <header className="bg-[#1C1C2E]">
      <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-500">
          <NailIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-bold text-white">{nombreSalon}</span>
          <p className="text-xs font-semibold tracking-wider text-fuchsia-400 uppercase">Nuevo turno</p>
        </div>
      </div>
    </header>
  )
}
