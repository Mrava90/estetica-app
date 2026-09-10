/**
 * GET /api/cron/facturar-qr
 *
 * Factura automaticamente los cobros por QR de MercadoPago.
 * Solo corre si `configuracion.facturacion_auto_qr` esta en true.
 *
 * ── Fuente HIBRIDA ───────────────────────────────────────────────────────
 * Cada fuente aporta lo que sabe mejor:
 *
 *   MercadoPago  → que cobros son QR (canal), monto y fecha exactos,
 *                  CUIL del pagador (de ahi sale el DNI), id unico
 *   Sheet        → nombre del servicio y nombre del cliente
 *   Tabla clientes → nombre, cuando el sheet no lo tiene
 *
 * MP manda como disparador: si un cobro no es QR, no se factura solo aunque
 * este en el sheet. Y el sheet aporta el detalle: si la venta todavia no
 * esta cargada ahi, el cobro queda pendiente en vez de facturarse con una
 * descripcion generica.
 *
 * ── Que factura ──────────────────────────────────────────────────────────
 *   1. Cobro QR aprobado de los ultimos DIAS_VENTANA dias
 *   2. Sin factura previa con ese mp_payment_id
 *   3. Que cruce con UNA fila del sheet (fecha + monto), para tener servicio
 *   4. Monto <= facturacion_auto_monto_max
 *
 * ── Ante errores ─────────────────────────────────────────────────────────
 * Al primer fallo se FRENA la corrida. Lo ya emitido queda emitido (el CAE
 * de ARCA es irreversible); el resto espera a la proxima.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withCronLog } from '@/lib/cron-logger'
import { traerPagosUltimosDias, type PagoMP } from '@/lib/mercadopago'
import { obtenerFilasFacturacion, type ItemFacturacion } from '@/lib/facturacion-sheet'
import { fechaArYMD } from '@/lib/timezone'
import { capitalizeWords } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Ventana de dias hacia atras que revisa cada corrida. */
const DIAS_VENTANA = 7

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const result = await withCronLog('facturar-qr', async () => {
      // ── 1. Switch prendido? ──────────────────────────────────────────────
      const { data: config } = await admin
        .from('configuracion')
        .select('facturacion_auto_qr, facturacion_auto_monto_max')
        .eq('id', 1)
        .single()

      if (!config?.facturacion_auto_qr) {
        return { skipped: true, motivo: 'facturacion automatica desactivada' }
      }

      const montoMax = Number(config.facturacion_auto_monto_max) || 100000
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://turnosballester.vercel.app'

      // ── 2. Cobros QR de la ventana ───────────────────────────────────────
      const qr = (await traerPagosUltimosDias(DIAS_VENTANA)).filter(p => p.tipo === 'QR')
      if (qr.length === 0) {
        await registrarRun(admin, 'Sin cobros QR en la ventana', null)
        return { emitidas: 0, candidatos: 0 }
      }

      // ── 3. Descartar los ya facturados ───────────────────────────────────
      const { data: yaFacturados } = await admin
        .from('facturas')
        .select('mp_payment_id')
        .in('mp_payment_id', qr.map(p => p.id))
        .not('mp_payment_id', 'is', null)
      const facturados = new Set((yaFacturados || []).map(f => Number(f.mp_payment_id)))

      const pendientes = qr.filter(p => !facturados.has(p.id) && p.monto > 0)

      // ── 4. Traer el sheet del mes actual y el anterior ───────────────────
      // El mes anterior entra porque la ventana de 7 dias puede cruzar el
      // cambio de mes.
      const [anio, mes] = fechaArYMD().split('-').map(Number)
      const mesActual = `${anio}-${String(mes).padStart(2, '0')}`
      const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`

      const filasSheet: ItemFacturacion[] = []
      for (const m of [mesPrevio, mesActual]) {
        const { items } = await obtenerFilasFacturacion(m)
        filasSheet.push(...items)
      }

      // Indexar filas del sheet por dia + monto, sin reusar la misma fila dos veces
      const idxSheet = new Map<string, ItemFacturacion[]>()
      for (const f of filasSheet) {
        const k = `${f.fecha}|${Math.round(f.monto)}`
        if (!idxSheet.has(k)) idxSheet.set(k, [])
        idxSheet.get(k)!.push(f)
      }
      const filasUsadas = new Set<string>()

      // ── 5. Armar los candidatos combinando ambas fuentes ─────────────────
      interface Candidato {
        pago: PagoMP
        fila: ItemFacturacion
      }
      const elegibles: Candidato[] = []
      const descartes = { sin_fila_sheet: 0, sobre_tope: 0, ya_excluida: 0, fila_ambigua: 0 }

      for (const pago of pendientes) {
        if (pago.monto > montoMax) { descartes.sobre_tope++; continue }

        const k = `${pago.diaAR}|${Math.round(pago.monto)}`
        const cands = (idxSheet.get(k) || []).filter(f => !filasUsadas.has(f.afip_row_key))

        if (cands.length === 0) { descartes.sin_fila_sheet++; continue }
        if (cands.length > 1)   { descartes.fila_ambigua++; continue }  // no adivinar

        const fila = cands[0]
        // Si ya tiene factura o fue descartada manualmente, respetarlo
        if (fila.factura_estado) { descartes.ya_excluida++; continue }

        filasUsadas.add(fila.afip_row_key)
        elegibles.push({ pago, fila })
      }

      if (elegibles.length === 0) {
        await registrarRun(admin, `Sin pendientes (${JSON.stringify(descartes)})`, null)
        return { emitidas: 0, candidatos: qr.length, descartes }
      }

      // ── 6. Resolver receptor. MercadoPago manda, el sheet es respaldo ────
      // El DNI de MP es el de la cuenta que efectivamente pago, ya validado
      // por MercadoPago. El del sheet lo tipea alguien a mano.
      // Para el nombre, buscamos ese DNI (o el email) en la tabla clientes:
      // ese nombre esta normalizado. Si no matchea, cae al del sheet.
      const dnisMP = elegibles.map(c => c.pago.pagadorDni).filter(Boolean) as string[]
      const dnisSheet = elegibles
        .map(c => c.fila.cliente_dni?.replace(/\D/g, ''))
        .filter((d): d is string => Boolean(d && d.length >= 7))
      const emails = elegibles.map(c => c.pago.pagadorEmail?.toLowerCase()).filter(Boolean) as string[]
      const todosDnis = [...new Set([...dnisMP, ...dnisSheet])]

      const [porDniRes, porEmailRes] = await Promise.all([
        todosDnis.length ? admin.from('clientes').select('nombre, apellido, dni, email').in('dni', todosDnis) : Promise.resolve({ data: [] }),
        emails.length ? admin.from('clientes').select('nombre, apellido, dni, email').in('email', emails) : Promise.resolve({ data: [] }),
      ])
      const porDni = new Map<string, any>()
      for (const c of porDniRes.data || []) if (c.dni) porDni.set(String(c.dni), c)
      const porEmail = new Map<string, any>()
      for (const c of porEmailRes.data || []) if (c.email) porEmail.set(c.email.toLowerCase(), c)

      function receptorDe({ pago, fila }: Candidato) {
        // DNI — orden: MP (validado) → sheet → null (Consumidor Final)
        const dniSheet = fila.cliente_dni?.replace(/\D/g, '') || null
        const dni = pago.pagadorDni || (dniSheet && dniSheet.length >= 7 ? dniSheet : null)

        // Nombre — orden: cliente de la app (buscado por el DNI/email de MP,
        // y si no por el DNI del sheet) → nombre del sheet → Consumidor Final
        const cliente =
          (pago.pagadorDni && porDni.get(pago.pagadorDni)) ||
          (pago.pagadorEmail && porEmail.get(pago.pagadorEmail.toLowerCase())) ||
          (dniSheet && porDni.get(dniSheet)) ||
          null
        const nombreApp = cliente
          ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim()
          : ''

        // El sheet trae los nombres en minuscula ("oriana gonzalez"); en la
        // factura tienen que ir capitalizados.
        const nombre = nombreApp
          || (fila.cliente_nombre?.trim() ? capitalizeWords(fila.cliente_nombre) : '')
          || 'Consumidor Final'
        const origen = nombreApp ? 'app' : fila.cliente_nombre?.trim() ? 'sheet' : 'generico'

        return { nombre, dni, origen }
      }

      // ── 7. Emitir. Al primer error, frenar. ──────────────────────────────
      const emitidas: Array<{ pagoId: number; cae: string }> = []
      let errorFatal: string | null = null

      for (const cand of elegibles) {
        const { pago, fila } = cand
        const { nombre, dni } = receptorDe(cand)

        const res = await fetch(`${appUrl}/api/facturacion/generar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({
            mp_payment_id:   pago.id,           // idempotencia
            afip_row_key:    fila.afip_row_key, // para que la pantalla la vea facturada
            receptor_nombre: nombre,
            receptor_dni:    dni,               // null → Consumidor Final
            monto:           pago.monto,        // el de MP, que es el que entro de verdad
            fecha:           pago.diaAR,
            descripcion:     fila.servicio_nombre?.trim() || 'Servicios de estética',
          }),
        })
        const json = await res.json().catch(() => ({}))

        if (!res.ok || json.error) {
          errorFatal = `Pago ${pago.id} (${pago.diaAR}, $${pago.monto}, ${nombre}): ${json.error || `HTTP ${res.status}`}`
          break
        }
        emitidas.push({ pagoId: pago.id, cae: json.cae })
      }

      const resumen = errorFatal
        ? `Frenado tras ${emitidas.length}/${elegibles.length} facturas`
        : `${emitidas.length} factura${emitidas.length === 1 ? '' : 's'} emitida${emitidas.length === 1 ? '' : 's'}`

      await registrarRun(admin, resumen, errorFatal)

      return {
        emitidas: emitidas.length,
        elegibles: elegibles.length,
        candidatos: qr.length,
        descartes,
        error: errorFatal,
        caes: emitidas.map(e => e.cae),
      }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[cron facturar-qr] error:', err)
    try {
      await registrarRun(admin, 'Error en la corrida', err?.message || String(err))
    } catch { /* ya logueado */ }
    return NextResponse.json({ error: err?.message || 'Error en el cron' }, { status: 500 })
  }
}

async function registrarRun(admin: ReturnType<typeof createAdminClient>, resultado: string, error: string | null) {
  await admin.from('configuracion').update({
    facturacion_auto_ultimo_run: new Date().toISOString(),
    facturacion_auto_ultimo_resultado: resultado,
    facturacion_auto_ultimo_error: error,
  }).eq('id', 1)
}
