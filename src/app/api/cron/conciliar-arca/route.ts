/**
 * GET /api/cron/conciliar-arca?mes=YYYY-MM
 *
 * Cruza lo que ARCA tiene emitido en el mes contra la tabla `facturas`.
 * SOLO LECTURA: consulta comprobantes (FECompUltimoAutorizado +
 * FECompConsultar), no emite ni modifica nada en ARCA ni en la base.
 *
 * Se autentica sola (por eso vive bajo /api/cron, que el middleware deja
 * pasar): con `Authorization: Bearer CRON_SECRET` o con sesion de admin
 * desde el boton de /facturacion.
 *
 * ── Que devuelve ─────────────────────────────────────────────────────────
 * Tomando como mes el de EMISION en ARCA (el que cuenta para el monotributo):
 *   coinciden     misma factura en los dos lados (numero, monto y CAE)
 *   diferencias   mismo numero pero distinto monto, CAE o documento
 *   soloArca      emitidas fuera de la app (por ejemplo, en la web de ARCA)
 *   soloApp       la app las tiene como emitidas y ARCA no las conoce
 *   duplicados    dos comprobantes con el mismo monto a la misma persona,
 *                 con ventas a 3 dias o menos
 *   manuales      marcadas "ya facturada" a mano: sin numero, no se pueden
 *                 verificar; se sugiere cual de soloArca podria ser
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/constants'
import { fechaArYMD } from '@/lib/timezone'
import { parecido } from '@/lib/facturacion-match'
import {
  getAuthTicket,
  invalidateAuthCache,
  isAuthErrorAfip,
  getUltimoComprobante,
  consultarComprobante,
  type ComprobanteARCA,
} from '@/lib/afip/wsfe'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Consultas en paralelo contra ARCA. Mas que esto y empieza a rechazar. */
const TANDA = 8
/** Tope de consultas por corrida, por si algo no corta. */
const MAX_CONSULTAS = 800

async function autorizado(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (secret && secret.length >= 16 && header) {
    const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return isAdminUser(user)
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!process.env.AFIP_CUIT || !process.env.AFIP_CERT || !process.env.AFIP_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno ARCA' }, { status: 503 })
  }

  const mes = request.nextUrl.searchParams.get('mes') || fechaArYMD().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Formato de mes invalido (YYYY-MM)' }, { status: 400 })
  }
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const cuit = process.env.AFIP_CUIT.trim()
  const ptoVta = parseInt((process.env.AFIP_PUNTO_VENTA || '1').trim(), 10)
  const tipoCbte = parseInt((process.env.AFIP_TIPO_CBTE || '11').trim(), 10)

  try {
    // ── 1. ARCA: recorrer desde el ultimo numero hacia atras ─────────────
    // Las fechas de emision crecen con el numero, asi que al encontrar una
    // tanda entera anterior al mes se puede cortar.
    let ta = await getAuthTicket(false)
    let ultimo: number
    try {
      ultimo = await getUltimoComprobante(cuit, ta.token, ta.sign, ptoVta, tipoCbte)
    } catch (err) {
      if (!isAuthErrorAfip(err)) throw err
      await invalidateAuthCache()
      ta = await getAuthTicket(true)
      ultimo = await getUltimoComprobante(cuit, ta.token, ta.sign, ptoVta, tipoCbte)
    }

    const arca: ComprobanteARCA[] = []
    let nro = ultimo
    let consultas = 0
    while (nro >= 1 && consultas < MAX_CONSULTAS) {
      const numeros: number[] = []
      for (let i = 0; i < TANDA && nro >= 1; i++) numeros.push(nro--)
      consultas += numeros.length
      const tanda = await Promise.all(numeros.map(n => consultarComprobante(cuit, ta.token, ta.sign, ptoVta, tipoCbte, n)))
      let anteriores = 0
      for (const c of tanda) {
        if (!c) continue
        if (c.fechaEmision < inicio) { anteriores++; continue }
        if (c.fechaEmision <= fin) arca.push(c)
      }
      if (anteriores === tanda.filter(Boolean).length && anteriores > 0) break
    }
    arca.sort((a, b) => a.nro - b.nro)

    // ── 2. App: facturas con numero, de este mes o que ARCA menciona ─────
    const admin = createAdminClient()
    const nros = arca.map(c => c.nro)
    const desdeISO = new Date(Date.UTC(y, m - 1, 1, 3)).toISOString()          // 00:00 AR
    const hastaISO = new Date(Date.UTC(y, m, 1, 3)).toISOString()
    const campos = 'id, afip_row_key, fecha, monto, receptor_nombre, receptor_dni, numero_cbte, cae, estado, created_at, datos_json'
    const [porNumero, porMes, manualesRes] = await Promise.all([
      nros.length
        ? admin.from('facturas').select(campos).eq('estado', 'emitida').in('numero_cbte', nros)
        : Promise.resolve({ data: [], error: null }),
      admin.from('facturas').select(campos).eq('estado', 'emitida').not('numero_cbte', 'is', null)
        .gte('created_at', desdeISO).lt('created_at', hastaISO),
      admin.from('facturas').select(campos).eq('estado', 'emitida').is('numero_cbte', null)
        .gte('fecha', inicio).lte('fecha', fin),
    ])
    const errDb = porNumero.error || porMes.error || manualesRes.error
    if (errDb) throw new Error('No se pudieron leer las facturas: ' + errDb.message)

    type Fac = NonNullable<typeof porMes.data>[number]
    const app = new Map<number, Fac>()
    for (const f of [...(porNumero.data || []), ...(porMes.data || [])]) app.set(Number(f.numero_cbte), f)

    // ── 3. Cruzar por numero ─────────────────────────────────────────────
    const enArca = new Map(arca.map(c => [c.nro, c]))
    const resumenFac = (f: Fac) => ({
      numero: Number(f.numero_cbte), fechaVenta: f.fecha, monto: Number(f.monto),
      receptor: f.receptor_nombre, dni: f.receptor_dni,
    })

    const coinciden: number[] = []
    const diferencias: Array<Record<string, unknown>> = []
    for (const c of arca) {
      const f = app.get(c.nro)
      if (!f) continue
      const problemas: string[] = []
      if (Math.abs(Number(f.monto) - c.monto) >= 0.01) problemas.push(`monto app $${f.monto} / ARCA $${c.monto}`)
      if (f.cae && c.cae && f.cae !== c.cae) problemas.push('CAE distinto')
      const dniApp = String(f.receptor_dni || '').replace(/\D/g, '')
      if (dniApp && c.docNro !== '0' && dniApp !== c.docNro) problemas.push(`DNI app ${dniApp} / ARCA ${c.docNro}`)
      if (problemas.length) diferencias.push({ ...resumenFac(f), arca: c, problemas })
      else coinciden.push(c.nro)
    }

    const soloArca = arca.filter(c => !app.has(c.nro))

    // Las que la app tiene con numero pero ARCA no trajo en el recorrido:
    // se consultan una por una para no confundir "fuera del mes" con "no existe".
    const faltantes = [...app.values()].filter(f => !enArca.has(Number(f.numero_cbte)))
    const soloApp: Array<Record<string, unknown>> = []
    for (const f of faltantes) {
      const c = await consultarComprobante(cuit, ta.token, ta.sign, ptoVta, tipoCbte, Number(f.numero_cbte))
      if (!c) soloApp.push({ ...resumenFac(f), motivo: 'ARCA no tiene ese numero' })
      else if (Math.abs(c.monto - Number(f.monto)) >= 0.01) {
        soloApp.push({ ...resumenFac(f), motivo: `en ARCA es de otro monto ($${c.monto}, emitida ${c.fechaEmision})` })
      }
      // Si existe y coincide, solo cae en otro mes de emision: no es problema.
    }

    // ── 4. Posibles duplicados dentro del mes ────────────────────────────
    const duplicados: Array<{ a: number; b: number; motivo: string }> = []
    for (let i = 0; i < arca.length; i++) {
      for (let j = i + 1; j < arca.length; j++) {
        const a = arca[i], b = arca[j]
        if (Math.abs(a.monto - b.monto) >= 1) continue
        const fa = app.get(a.nro), fb = app.get(b.nro)
        if (a.docNro !== '0' && a.docNro === b.docNro) {
          duplicados.push({ a: a.nro, b: b.nro, motivo: `mismo DNI ${a.docNro} y monto $${a.monto}` })
        } else if (fa && fb) {
          const dias = Math.abs(new Date(fa.fecha).getTime() - new Date(fb.fecha).getTime()) / 86_400_000
          if (dias <= 3 && parecido(fa.receptor_nombre, fa.receptor_dni, fb.receptor_nombre, fb.receptor_dni) > 0) {
            duplicados.push({ a: a.nro, b: b.nro, motivo: `${fa.receptor_nombre} / ${fb.receptor_nombre}, $${a.monto}, ventas ${fa.fecha} y ${fb.fecha}` })
          }
        }
      }
    }

    // ── 5. Marcadas a mano: sugerir cual de soloArca podria ser ──────────
    const manuales = (manualesRes.data || []).map(f => {
      const candidatas = soloArca.filter(c =>
        Math.abs(c.monto - Number(f.monto)) < 1 &&
        c.fechaEmision >= f.fecha &&
        (new Date(c.fechaEmision).getTime() - new Date(f.fecha).getTime()) / 86_400_000 <= 10)
      return { fechaVenta: f.fecha, monto: Number(f.monto), receptor: f.receptor_nombre, posiblesEnArca: candidatas.map(c => c.nro) }
    })

    const total = (xs: { monto: number }[]) => Math.round(xs.reduce((s, x) => s + x.monto, 0) * 100) / 100
    return NextResponse.json({
      ok: true,
      mes,
      puntoVenta: ptoVta,
      tipoCbte,
      ultimoNumero: ultimo,
      consultas,
      arca: {
        cantidad: arca.length,
        total: total(arca),
        desde: arca[0]?.nro ?? null,
        hasta: arca[arca.length - 1]?.nro ?? null,
      },
      coinciden: coinciden.length,
      diferencias,
      soloArca: soloArca.map(c => ({ numero: c.nro, emision: c.fechaEmision, monto: c.monto, doc: c.docNro })),
      soloApp,
      duplicados,
      manuales,
      generado: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conciliar-arca]', err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
