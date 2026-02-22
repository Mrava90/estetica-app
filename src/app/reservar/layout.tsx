import { ReservarHeader } from '@/components/reservar/ReservarHeader'

export const dynamic = 'force-dynamic'

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-100 via-pink-50 to-white">
      <ReservarHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
