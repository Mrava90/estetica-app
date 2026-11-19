/**
 * Abre WhatsApp a una clienta con el teléfono ACTUAL de la base.
 *
 * El calendario carga los turnos con los datos de la clienta y no se entera si
 * después le cambian el teléfono en Clientes; por eso se relee al abrir.
 * La ventana se abre antes de consultar para que el navegador no la bloquee.
 */
import { createClient } from '@/lib/supabase/client'
import { normalizarTelefono } from '@/lib/telefono'

/** "1155667788" → "5491155667788" (formato que entiende wa.me para Argentina). */
export function numeroWhatsApp(tel: string | null | undefined): string {
  const t = normalizarTelefono(tel)
  if (!t) return ''
  return t.length === 10 ? `549${t}` : t
}

export async function abrirWhatsApp(clienteId: string | null | undefined, telefonoCargado: string | null | undefined, mensaje: string) {
  const ventana = window.open('', '_blank')
  let tel = telefonoCargado
  if (clienteId) {
    const { data } = await createClient().from('clientes').select('telefono').eq('id', clienteId).maybeSingle()
    if (data?.telefono) tel = data.telefono
  }
  const url = `https://wa.me/${numeroWhatsApp(tel)}?text=${encodeURIComponent(mensaje)}`
  if (ventana) ventana.location.href = url
  else window.open(url, '_blank')
}
