import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getRpInfo(origin: string) {
  try {
    const url = new URL(origin)
    return { rpID: url.hostname, expectedOrigin: origin }
  } catch {
    return { rpID: 'localhost', expectedOrigin: 'http://localhost:3000' }
  }
}

export async function POST(request: Request) {
  try {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId, response } = body

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { rpID, expectedOrigin } = getRpInfo(origin)

  const admin = createAdminClient()

  // Get and validate challenge
  const { data: challengeRow } = await admin
    .from('webauthn_challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('user_id', user.id)
    .eq('type', 'registration')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!challengeRow) {
    return NextResponse.json({ error: 'Challenge inválido o expirado' }, { status: 400 })
  }

  // Delete challenge (single use)
  await admin.from('webauthn_challenges').delete().eq('id', challengeId)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
    })
  } catch (err) {
    return NextResponse.json({ error: `Verificación fallida: ${err}` }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verificación fallida' }, { status: 400 })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  // Store credential
  const { error: insertError } = await admin.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    transports: credential.transports ?? [],
    rp_id: rpID,
  })

  if (insertError) {
    return NextResponse.json({ error: 'Error al guardar credencial' }, { status: 500 })
  }

  return NextResponse.json({ verified: true })
  } catch (err) {
    return NextResponse.json({ error: `Error interno: ${err}` }, { status: 500 })
  }
}
