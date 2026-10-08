'use client'

// Item del menu con pestañas: ver SeccionConPestanas y NAV_ITEMS.
import { Suspense } from 'react'
import { SeccionConPestanas } from '@/components/layout/SeccionConPestanas'
import InformesSeccion from '@/components/secciones/InformesSeccion'
import ContabilidadSeccion from '@/components/secciones/ContabilidadSeccion'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeccionConPestanas
        href="/informes"
        principal={{ valor: 'informes', label: 'Informes', contenido: <InformesSeccion /> }}
        contenidos={{ contabilidad: <ContabilidadSeccion /> }}
      />
    </Suspense>
  )
}
