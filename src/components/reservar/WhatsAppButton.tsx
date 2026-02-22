'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function WhatsAppButton() {
  const [telefono, setTelefono] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTelefono() {
      const supabase = createClient()
      const { data } = await supabase.from('configuracion').select('telefono').single()
      if (data?.telefono) setTelefono(data.telefono)
    }
    fetchTelefono()
  }, [])

  if (!telefono) return null

  const cleanNumber = telefono.replace(/\D/g, '')
  const url = `https://wa.me/${cleanNumber}?text=Hola!%20Tengo%20una%20consulta`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg hover:bg-[#20bd5a] transition-colors"
      aria-label="Contactar por WhatsApp"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7 fill-white">
        <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.132 6.744 3.054 9.378L1.056 31.2l6.06-1.944a15.9 15.9 0 0 0 8.888 2.696C24.826 31.952 32 24.776 32 16.004S24.826 0 16.004 0zm9.35 22.614c-.396 1.116-1.962 2.04-3.222 2.31-.864.184-1.992.33-5.79-1.244-4.86-2.016-7.986-6.942-8.226-7.266-.232-.324-1.944-2.592-1.944-4.944s1.228-3.504 1.664-3.984c.436-.48.952-.6 1.268-.6.316 0 .632.004.908.016.292.012.684-.11 1.068.816.396.952 1.348 3.288 1.464 3.528.116.24.196.52.04.832-.156.316-.232.512-.464.788-.232.276-.488.616-.696.824-.232.232-.472.484-.204.952.268.468 1.196 1.972 2.568 3.196 1.764 1.572 3.252 2.06 3.716 2.288.464.228.736.192 1.008-.116.276-.308 1.172-1.368 1.484-1.836.308-.468.62-.388 1.048-.232.428.156 2.76 1.3 3.232 1.536.472.236.788.352.904.552.116.196.116 1.152-.28 2.268z" />
      </svg>
    </a>
  )
}
