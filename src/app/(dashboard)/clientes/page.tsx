'use client'

// Item del menu con pestañas: ver SeccionConPestanas y NAV_ITEMS.
import { Suspense } from 'react'
import { SeccionConPestanas } from '@/components/layout/SeccionConPestanas'
import ClientesSeccion from '@/components/secciones/ClientesSeccion'
import AccesosSeccion from '@/components/secciones/AccesosSeccion'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeccionConPestanas
        href="/clientes"
        principal={{ valor: 'clientes', label: 'Clientes', contenido: <ClientesSeccion /> }}
        contenidos={{ accesos: <AccesosSeccion /> }}
      />
    </Suspense>
  )
}
