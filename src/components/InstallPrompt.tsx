'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => void } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt: () => void })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl border border-gray-100">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="Ka Wirth" className="h-10 w-10 rounded-xl" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Instalar app</p>
          <p className="text-xs text-gray-500">Agregá Ka Wirth a tu pantalla</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-gray-400 px-2 py-1"
        >
          No
        </button>
        <button
          onClick={() => { deferredPrompt.prompt(); setDeferredPrompt(null) }}
          className="flex items-center gap-1 rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-white"
        >
          <Download className="h-3 w-3" />
          Instalar
        </button>
      </div>
    </div>
  )
}
