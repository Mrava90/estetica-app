'use client'

// Item del menu con pestañas: ver SeccionConPestanas y NAV_ITEMS.
import { Suspense } from 'react'
import { SeccionConPestanas } from '@/components/layout/SeccionConPestanas'
import FacturacionSeccion from '@/components/secciones/FacturacionSeccion'
import AfipSeccion from '@/components/secciones/AfipSeccion'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeccionConPestanas
        href="/facturacion"
        principal={{ valor: 'facturas', label: 'Facturas', contenido: <FacturacionSeccion /> }}
        contenidos={{ monotributo: <AfipSeccion /> }}
      />
    </Suspense>
  )
}
