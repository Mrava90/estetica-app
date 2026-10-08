import { redirect } from 'next/navigation'

// Desde el 08/10/2026 es una pestaña de /informes. La ruta vieja sigue
// andando para enlaces guardados.
export default function Page() {
  redirect('/informes?tab=contabilidad')
}
