'use client'

// Item del menu con pestañas: ver SeccionConPestanas y NAV_ITEMS.
import { Suspense } from 'react'
import { SeccionConPestanas } from '@/components/layout/SeccionConPestanas'
import ConfiguracionSeccion from '@/components/secciones/ConfiguracionSeccion'
import ActividadSeccion from '@/components/secciones/ActividadSeccion'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeccionConPestanas
        href="/configuracion"
        principal={{ valor: 'ajustes', label: 'Ajustes', contenido: <ConfiguracionSeccion /> }}
        contenidos={{ actividad: <ActividadSeccion /> }}
      />
    </Suspense>
  )
}
