import type { Metadata } from 'next'
import { ReservarHeader } from '@/components/reservar/ReservarHeader'
import { WhatsAppButton } from '@/components/reservar/WhatsAppButton'
import { InstallPrompt } from '@/components/InstallPrompt'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ka Wirth Ballester',
  description: 'Reservá tu turno online',
}

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* Background image */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/foto-salon.jpg')" }}
      />
      {/* Overlay for readability */}
      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-black/30 to-white/80" />

      {/* Content */}
      <div className="relative z-10">
        <ReservarHeader />
        <main className="mx-auto max-w-2xl px-4 py-8">
          {children}
        </main>
      </div>
      <WhatsAppButton />
      <InstallPrompt />
    </div>
  )
}
