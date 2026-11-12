import { redirect } from 'next/navigation'

// Es una pestaña de /servicios (al lado de Promociones).
export default function Page() {
  redirect('/servicios?tab=mails')
}
