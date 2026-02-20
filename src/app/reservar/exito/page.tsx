'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatFechaHora } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'

function ExitoContent() {
  const searchParams = useSearchParams()
  const fecha = searchParams.get('fecha')

  return (
    <div className="flex flex-col items-center space-y-6 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">¡Turno confirmado!</h1>
        <p className="text-muted-foreground">
          Tu turno ha sido reservado exitosamente
        </p>
      </div>

      {fecha && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Fecha del turno</p>
            <p className="text-lg font-semibold">{formatFechaHora(fecha)}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Te enviaremos un recordatorio por WhatsApp antes de tu cita.
        Si necesitás cancelar o cambiar el turno, contactanos.
      </p>

      <Button asChild>
        <Link href="/reservar">Reservar otro turno</Link>
      </Button>
    </div>
  )
}

export default function ExitoPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground py-12">Cargando...</div>}>
      <ExitoContent />
    </Suspense>
  )
}
