/**
 * Genera la clave privada RSA y el CSR para ARCA (ex-AFIP).
 *
 * Uso:
 *   node scripts/generar-csr.mjs
 *
 * Archivos generados:
 *   scripts/arca.key  → Clave privada (guardar en secreto, va en AFIP_KEY en Vercel)
 *   scripts/arca.csr  → Certificate Signing Request (subir a ARCA)
 */

import forge from 'node-forge'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as readline from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))

function pregunta(rl, texto) {
  return new Promise(resolve => rl.question(texto, resolve))
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n=== Generador de certificado para ARCA (Factura Electrónica) ===\n')

  const cuit        = await pregunta(rl, 'CUIT (sin guiones, ej: 27123456789): ')
  const razonSocial = await pregunta(rl, 'Nombre / Razón social: ')
  rl.close()

  if (!cuit.trim().match(/^\d{11}$/)) {
    console.error('❌ El CUIT debe tener exactamente 11 dígitos sin guiones.')
    process.exit(1)
  }

  console.log('\n⏳ Generando par de claves RSA 2048 bits...')

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey)

  // Crear el CSR
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  csr.setSubject([
    { name: 'commonName',       value: cuit.trim() },
    { name: 'organizationName', value: razonSocial.trim() },
    { name: 'countryName',      value: 'AR' },
  ])
  csr.sign(keys.privateKey, forge.md.sha256.create())

  const csrPem = forge.pki.certificationRequestToPem(csr)

  // Guardar archivos
  const keyPath = join(__dirname, 'arca.key')
  const csrPath = join(__dirname, 'arca.csr')

  writeFileSync(keyPath, privateKeyPem, 'utf8')
  writeFileSync(csrPath, csrPem, 'utf8')

  console.log('\n✅ Archivos generados:')
  console.log(`   📄 ${keyPath}`)
  console.log(`   📄 ${csrPath}`)
  console.log('\n📋 PRÓXIMOS PASOS:')
  console.log('   1. Ingresá a arca.gob.ar con tu clave fiscal nivel 3')
  console.log('   2. Servicios → Administrador de Relaciones de Clave Fiscal')
  console.log('      → Adherir Servicio → buscar "wsfe" → Factura Electrónica')
  console.log('   3. En el mismo menú: Gestión de Certificados Digitales')
  console.log('   4. Subí el archivo arca.csr')
  console.log('   5. ARCA te devuelve un archivo .crt (el certificado)')
  console.log('   6. Avisame cuando tengas el .crt y lo configuramos en Vercel\n')
  console.log('⚠️  NO compartas el archivo arca.key con nadie.')
  console.log('   Guardalo en un lugar seguro — NO lo subas a GitHub.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
