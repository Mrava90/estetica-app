import { redirect } from 'next/navigation'

// Desde el 08/10/2026 es una pestaña de /clientes. La ruta vieja sigue
// andando para enlaces guardados.
export default function Page() {
  redirect('/clientes?tab=accesos')
}
