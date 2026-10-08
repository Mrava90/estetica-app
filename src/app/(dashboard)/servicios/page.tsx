'use client'

// Item del menu con pestañas: ver SeccionConPestanas y NAV_ITEMS.
import { Suspense } from 'react'
import { SeccionConPestanas } from '@/components/layout/SeccionConPestanas'
import ServiciosSeccion from '@/components/secciones/ServiciosSeccion'
import PromocionesSeccion from '@/components/secciones/PromocionesSeccion'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeccionConPestanas
        href="/servicios"
        principal={{ valor: 'servicios', label: 'Servicios', contenido: <ServiciosSeccion /> }}
        contenidos={{ promociones: <PromocionesSeccion /> }}
      />
    </Suspense>
  )
}
