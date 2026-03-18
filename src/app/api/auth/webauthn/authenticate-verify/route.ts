import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WebAuthnCredential } from '@simplewebauthn/server'

function getOriginFromRequest(request: Request): string {
  return request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { challengeId, response } = body

    const origin = getOriginFromRequest(request)

    const admin = createAdminClient()

    // Get challenge
    const { data: challengeRow } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('type', 'authentication')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!challengeRow) {
      return NextResponse.json({ error: 'Challenge inválido o expirado' }, { status: 400 })
    }

    // Delete challenge (single use)
    await admin.from('webauthn_challenges').delete().eq('id', challengeId)

    // Find credential by response.id
    const credentialId = response.id as string
    const { data: credRow } = await admin
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', credentialId)
      .single()

    if (!credRow) {
      return NextResponse.json({ error: 'Credencial no encontrada' }, { status: 404 })
    }

    const credential: WebAuthnCredential = {
      id: credRow.credential_id,
      publicKey: new Uint8Array(Buffer.from(credRow.public_key, 'base64url')),
      counter: Number(credRow.counter),
      transports: credRow.transports as WebAuthnCredential['transports'],
    }

    const expectedRPID = credRow.rp_id
    const expectedOrigin = origin

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin,
        expectedRPID,
        credential,
      })
    } catch (err) {
      return NextResponse.json({ error: `Verificación fallida: ${err}` }, { status: 400 })
    }

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verificación fallida' }, { status: 400 })
    }

    // Update counter
    await admin
      .from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('credential_id', credentialId)

    // Get user email to generate session
    const userResult = await admin.auth.admin.getUserById(credRow.user_id)
    const user = userResult.data?.user
    if (!user?.email) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Generate magic link token (won't send email, just returns the token)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: `Error al crear sesión: ${linkError?.message}` }, { status: 500 })
    }

    return NextResponse.json({ tokenHash: linkData.properties.hashed_token })
  } catch (err) {
    return NextResponse.json({ error: `Error interno: ${err}` }, { status: 500 })
  }
}
