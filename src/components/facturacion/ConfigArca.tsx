'use client'

import { useState } from 'react'
import { Building2, Settings2, ExternalLink, Info, Send, Loader2 } from 'lucide-react'

interface TestResult {
  ok: boolean
  checks: Record<string, { ok: boolean; detail: string }>
  entorno?: string
}

const PASOS = [
  {
    n: 1,
    title: 'Ejecutar la migración en Supabase',
    body: <>SQL Editor → pegá el contenido de <code className="bg-muted px-1 rounded text-xs">supabase/migrations/00009_facturas.sql</code></>,
  },
  {
    n: 2,
    title: 'Obtener certificado digital X.509 en ARCA',
    body: 'arca.gob.ar con tu CUIT → Administrador de Relaciones → WSFEV1 → Descargar certificado',
  },
  {
    n: 3,
    title: 'Variables de entorno en Vercel',
    body: (
      <div className="mt-1 rounded-lg bg-muted p-3 font-mono text-xs space-y-0.5">
        <p><span className="text-blue-700">AFIP_CUIT</span>=20xxxxxxxxx8</p>
        <p><span className="text-blue-700">AFIP_CERT</span>=-----BEGIN CERTIFICATE-----...</p>
        <p><span className="text-blue-700">AFIP_KEY</span>=-----BEGIN PRIVATE KEY-----...</p>
        <p><span className="text-blue-700">AFIP_PUNTO_VENTA</span>=1</p>
        <p><span className="text-blue-700">AFIP_TIPO_CBTE</span>=11 <span className="text-muted-foreground"># 11=Factura C</span></p>
        <p><span className="text-blue-700">AFIP_PROD</span>=false <span className="text-muted-foreground"># false=testing</span></p>
      </div>
    ),
  },
  {
    n: 4,
    title: 'Probar en homologación, luego producción',
    body: 'Con AFIP_PROD=false los CAE son de prueba. Cuando funcione todo, cambiá a true.',
  },
]

/**
 * Tab "Config ARCA" de la pantalla de facturacion.
 *
 * Es casi todo documentacion estatica; lo unico vivo es el test de conexion,
 * cuyo estado vive aca adentro porque no lo necesita nadie mas.
 */
export function ConfigArca() {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  async function testConexion() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/facturacion/test')
      const json = await res.json()
      setTestResult(json)
    } catch {
      setTestResult({ ok: false, checks: { conexion: { ok: false, detail: 'Error de red al contactar el servidor' } } })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="space-y-3 max-w-2xl text-sm">

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-blue-800">
          <Building2 className="h-5 w-5" /> Integración con ARCA (ex-AFIP)
        </div>
        <p className="text-sm text-blue-700 leading-relaxed">
          ARCA usa Web Services SOAP. Flujo: certificado digital →
          autenticación WSAA (token 12 h) → solicitud WSFEV1 →
          recibo <strong>CAE</strong> (14 dígitos de validez fiscal).
        </p>
        <p className="text-sm text-blue-700">
          💡 Sin DNI del cliente → se emite a <strong>Consumidor Final</strong> (válido hasta $10.000.000).
        </p>
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" /> Pasos para activar
        </h2>
        <ol className="space-y-4 text-sm">
          {PASOS.map(({ n, title, body }) => (
            <li key={n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">{n}</span>
              <div><p className="font-medium">{title}</p><div className="text-muted-foreground mt-0.5">{body}</div></div>
            </li>
          ))}
        </ol>
        <a href="https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Documentación oficial ARCA
        </a>
      </div>

      {/* Test de conexión */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" /> Probar conexión con ARCA
        </h2>
        <p className="text-sm text-muted-foreground">
          Verifica que las variables de entorno estén configuradas, el certificado sea válido y el WSAA responda.
        </p>
        <button
          onClick={testConexion}
          disabled={testLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {testLoading ? 'Verificando...' : 'Probar conexión'}
        </button>
        {testResult && (
          <div className={`rounded-lg border p-4 space-y-2 ${testResult.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <p className={`font-semibold text-sm ${testResult.ok ? 'text-green-800' : 'text-red-800'}`}>
              {testResult.ok ? '✓ Conexión exitosa' : '✗ Hay problemas de configuración'}
              {testResult.entorno && ` (${testResult.entorno})`}
            </p>
            <ul className="space-y-1">
              {Object.entries(testResult.checks).map(([key, val]) => (
                <li key={key} className="flex items-start gap-2 text-xs">
                  <span className={val.ok ? 'text-green-600' : 'text-red-600'}>{val.ok ? '✓' : '✗'}</span>
                  <span className={val.ok ? 'text-green-800' : 'text-red-800'}>{val.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" /> Tipo de factura según categoría fiscal
        </h2>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p><strong className="text-foreground">Factura C (tipo 11)</strong> · Monotributista → consumidor final</p>
          <p><strong className="text-foreground">Factura B (tipo 6)</strong> · Resp. Inscripto → consumidor final o monotributista</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          Para clientes <strong>sin DNI</strong>: DocTipo=99 (Consumidor Final), DocNro=0. Válido para montos &lt; $10.000.000.
        </div>
      </div>

    </div>
  )
}
