import { ReservarHeader } from '@/components/reservar/ReservarHeader'
import { WhatsAppButton } from '@/components/reservar/WhatsAppButton'

export const dynamic = 'force-dynamic'

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* Background image */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/foto-salon.jpg')" }}
      />
      {/* Overlay for readability */}
      <div className="fixed inset-0 bg-gradient-to-b from-fuchsia-200/85 via-pink-50/90 to-white/95" />

      {/* Content */}
      <div className="relative z-10">
        <ReservarHeader />
        <main className="mx-auto max-w-2xl px-4 py-8">
          {children}
        </main>
      </div>
      <WhatsAppButton />
    </div>
  )
}
