'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Scissors } from 'lucide-react'

export function ReservarHeader() {
  const [nombreSalon, setNombreSalon] = useState('Mi Estética')

  useEffect(() => {
    async function fetchConfig() {
      const supabase = createClient()
      const { data } = await supabase.from('configuracion').select('nombre_salon').single()
      if (data) setNombreSalon(data.nombre_salon)
    }
    fetchConfig()
  }, [])

  return (
    <header className="bg-card border-b">
      <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-2">
        <Scissors className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold">{nombreSalon}</span>
      </div>
    </header>
  )
}
