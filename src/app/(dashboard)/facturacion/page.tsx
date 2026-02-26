'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/dates'
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings2,
  Info,
  ExternalLink,
  Loader2,
  Building2,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface FilaFacturacion {
  cita_id: string
  fecha: string
  cliente_nombre: string | null
  cliente_dni: string | null
  servicio_nombre: string | null
  monto: number
  notas: string | null
  factura_id: string | null
  factura_cae: string | null
  factura_numero: string | null
  factura_estado: 'pendiente' | 'emitida' | 'error' | null
  factura_vencimiento: string | null
}

type TabType = 'transacciones' | 'configuracion'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mesLabel(fecha: Date): string {
  return fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function badgeEstado(estado: string | null) {
  if (!estado || estado === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
        <Clock className="h-3 w-3" /> Pendiente
      </span>
    )
  }
  if (estado === 'emitida') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Emitida
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function FacturacionPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabType>('transacciones')
  const [filas, setFilas] = useState<FilaFacturacion[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Selector de mes
  const [mesBase, setMesBase] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const mesAnterior = () => setMesBase(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const mesSiguiente = () => setMesBase(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  // ── Fetch de datos ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const year = mesBase.getFullYear()
    const month = mesBase.getMonth() + 1
    const desde = `${year}-${String(month).padStart(2, '0')}-01`
    const hasta = new Date(year, month, 0).toISOString().slice(0, 10)

    // Citas mercadopago del mes
    const { data: citas, error: citasErr } = await supabase
      .from('citas')
      .select(`
        id,
        fecha_inicio,
        precio_cobrado,
        metodo_pago,
        notas,
        cliente:clientes(nombre, dni),
        servicio:servicios(nombre),
        factura:facturas(id, cae, numero_cbte, estado, cae_vencimiento)
      `)
      .in('metodo_pago', ['mercadopago', 'transferencia'])
      .eq('status', 'completada')
      .gte('fecha_inicio', `${desde}T00:00:00`)
      .lte('fecha_inicio', `${hasta}T23:59:59`)
      .order('fecha_inicio', { ascending: false })

    if (citasErr) {
      setError('Error al cargar las transacciones.')
      setLoading(false)
      return
    }

    const rows: FilaFacturacion[] = (citas || []).map((c: any) => {
      const factura = Array.isArray(c.factura) ? c.factura[0] : c.factura
      const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente
      const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio
      return {
        cita_id: c.id,
        fecha: c.fecha_inicio?.slice(0, 10) ?? '',
        cliente_nombre: cliente?.nombre ?? null,
        cliente_dni: cliente?.dni ?? null,
        servicio_nombre: servicio?.nombre ?? null,
        monto: c.precio_cobrado ?? 0,
        notas: c.notas ?? null,
        factura_id: factura?.id ?? null,
        factura_cae: factura?.cae ?? null,
        factura_numero: factura?.numero_cbte != null ? String(factura.numero_cbte).padStart(8, '0') : null,
        factura_estado: factura?.estado ?? null,
        factura_vencimiento: factura?.cae_vencimiento ?? null,
      }
    })

    setFilas(rows)
    setLoading(false)
  }, [mesBase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // ── Generar factura ───────────────────────────────────────────────────────

  async function handleGenerar(fila: FilaFacturacion) {
    setGenerando(fila.cita_id)
    setError(null)
    try {
      const res = await fetch('/api/facturacion/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cita_id: fila.cita_id,
          receptor_nombre: fila.cliente_nombre,
          receptor_dni: fila.cliente_dni,
          monto: fila.monto,
          fecha: fila.fecha,
          descripcion: fila.servicio_nombre ?? fila.notas ?? 'Servicio de estética',
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `Error al generar la factura (HTTP ${res.status})`)
      } else {
        await fetchData()
      }
    } catch (e) {
      setError('No se pudo conectar con el servidor de facturación.')
    } finally {
      setGenerando(null)
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalMonto = filas.reduce((s, f) => s + f.monto, 0)
  const emitidas = filas.filter(f => f.factura_estado === 'emitida').length
  const pendientes = filas.filter(f => !f.factura_estado || f.factura_estado === 'pendiente').length
  const conError = filas.filter(f => f.factura_estado === 'error').length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-600" />
            Facturación Electrónica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comprobantes fiscales para pagos con MercadoPago · Integración ARCA (AFIP)
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border bg-muted p-1 self-start">
          <button
            onClick={() => setTab('transacciones')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'transacciones' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> Transacciones
          </button>
          <button
            onClick={() => setTab('configuracion')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'configuracion' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" /> Configuración ARCA
          </button>
        </div>
      </div>

      {/* ── TAB: Transacciones ─────────────────────────────────────────────── */}
      {tab === 'transacciones' && (
        <>
          {/* Selector de mes */}
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 self-start w-fit">
            <button onClick={mesAnterior} className="rounded p-1 hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-40 text-center font-medium capitalize">{mesLabel(mesBase)}</span>
            <button onClick={mesSiguiente} className="rounded p-1 hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total MercadoPago</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{formatPrecio(totalMonto)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{filas.length} transacciones</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Facturas emitidas</p>
              <p className="text-xl font-bold text-green-700 mt-1">{emitidas}</p>
              <p className="text-xs text-muted-foreground mt-0.5">con CAE de ARCA</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-xl font-bold text-yellow-700 mt-1">{pendientes}</p>
              <p className="text-xs text-muted-foreground mt-0.5">sin factura aún</p>
            </div>
            {conError > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs text-red-600">Con error</p>
                <p className="text-xl font-bold text-red-700 mt-1">{conError}</p>
                <p className="text-xs text-red-500 mt-0.5">reintentar</p>
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Tabla de transacciones */}
          <div className="rounded-xl border bg-card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
              </div>
            ) : filas.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin transacciones MercadoPago</p>
                <p className="text-sm mt-1">No hay citas completadas con MercadoPago en este mes.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Servicio</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monto</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Estado</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">CAE</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.cita_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {isoToDisplay(fila.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{fila.cliente_nombre ?? <span className="text-muted-foreground italic">Sin nombre</span>}</div>
                        {fila.cliente_dni && (
                          <div className="text-xs text-muted-foreground">DNI {fila.cliente_dni}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                        {fila.servicio_nombre ?? fila.notas?.slice(0, 40) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatPrecio(fila.monto)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {badgeEstado(fila.factura_estado)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {fila.factura_cae ? (
                          <div>
                            <span className="font-mono text-xs text-green-700">{fila.factura_cae}</span>
                            {fila.factura_vencimiento && (
                              <div className="text-xs text-muted-foreground">Vence {isoToDisplay(fila.factura_vencimiento)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fila.factura_estado === 'emitida' ? (
                          <span className="text-xs text-muted-foreground">
                            N° {fila.factura_numero}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleGenerar(fila)}
                            disabled={generando === fila.cita_id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {generando === fila.cita_id ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Generando...</>
                            ) : (
                              <><Receipt className="h-3 w-3" /> Generar</>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Configuración ARCA ────────────────────────────────────────── */}
      {tab === 'configuracion' && (
        <div className="space-y-6 max-w-2xl">

          {/* Info ARCA */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-blue-800">
              <Building2 className="h-5 w-5" />
              ¿Qué es ARCA y cómo funciona?
            </div>
            <p className="text-sm text-blue-700 leading-relaxed">
              <strong>ARCA</strong> (ex-AFIP) es el organismo recaudador de Argentina.
              Para emitir facturas electrónicas legales, debés conectarte a su sistema
              de Web Services usando un <strong>certificado digital X.509</strong> asociado a tu CUIT.
            </p>
            <p className="text-sm text-blue-700 leading-relaxed">
              Cada vez que generás una factura, la app se conecta a ARCA, valida los datos
              y recibe un <strong>CAE</strong> (Código de Autorización Electrónico), que es
              la clave que acredita la validez fiscal del comprobante.
            </p>
            <p className="text-sm text-blue-700 font-medium">
              💡 Para facturas a Consumidor Final (servicios de estética), no se requiere
              el CUIT del cliente para montos menores a $10.000.000.
            </p>
          </div>

          {/* Pasos de configuración */}
          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              Pasos para activar la integración
            </h2>

            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">1</span>
                <div>
                  <p className="font-medium">Generá tu certificado digital X.509</p>
                  <p className="text-muted-foreground mt-0.5">
                    Ingresá a <strong>ARCA → Servicios habilitados → Administrador de Relaciones</strong>,
                    agregá el servicio WSFEV1 y descargá el certificado de homologación (testing).
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">2</span>
                <div>
                  <p className="font-medium">Configurá las variables de entorno en Vercel</p>
                  <p className="text-muted-foreground mt-0.5">
                    En tu proyecto Vercel, agregá las siguientes variables:
                  </p>
                  <div className="mt-2 rounded-lg bg-muted p-3 font-mono text-xs space-y-1">
                    <p><span className="text-blue-700">AFIP_CUIT</span>=20xxxxxxxxx8</p>
                    <p><span className="text-blue-700">AFIP_CERT</span>=-----BEGIN CERTIFICATE-----...</p>
                    <p><span className="text-blue-700">AFIP_KEY</span>=-----BEGIN PRIVATE KEY-----...</p>
                    <p><span className="text-blue-700">AFIP_PUNTO_VENTA</span>=1</p>
                    <p><span className="text-blue-700">AFIP_TIPO_CBTE</span>=11  <span className="text-muted-foreground"># 11=Factura C, 6=Factura B</span></p>
                    <p><span className="text-blue-700">AFIP_PROD</span>=false  <span className="text-muted-foreground"># false=testing, true=producción</span></p>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">3</span>
                <div>
                  <p className="font-medium">Ejecutá la migración de base de datos</p>
                  <p className="text-muted-foreground mt-0.5">
                    Corré el archivo <code className="bg-muted px-1 rounded">00009_facturas.sql</code> en
                    el editor SQL de Supabase para crear la tabla de facturas.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">4</span>
                <div>
                  <p className="font-medium">Probá en modo homologación (testing)</p>
                  <p className="text-muted-foreground mt-0.5">
                    Con <code className="bg-muted px-1 rounded">AFIP_PROD=false</code>, las facturas
                    generadas no tienen validez fiscal pero te permiten verificar que todo funcione.
                    Cuando estés listo, cambiá a <code className="bg-muted px-1 rounded">AFIP_PROD=true</code>.
                  </p>
                </div>
              </li>
            </ol>

            <a
              href="https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Documentación oficial ARCA — Web Services Factura Electrónica
            </a>
          </div>

          {/* Tipo de factura */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              ¿Qué tipo de factura emitir?
            </h2>
            <div className="text-sm space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Factura C</strong> (tipo 11) · Si sos <strong>Monotributista</strong>. Es la más común para servicios de estética al consumidor final.</p>
              <p><strong className="text-foreground">Factura B</strong> (tipo 6) · Si sos <strong>Responsable Inscripto</strong> y el cliente es Consumidor Final o Monotributista.</p>
              <p><strong className="text-foreground">Factura A</strong> (tipo 1) · Si sos Responsable Inscripto y el cliente también lo es (requiere CUIT).</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Importante:</strong> Para servicios de estética a clientes particulares,
              lo más habitual es <strong>Factura C</strong> (Monotributista).
              No necesitás el CUIT del cliente para montos menores a $10.000.000.
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
