import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getRpInfo(origin: string) {
  try {
    const url = new URL(origin)
    return { rpID: url.hostname }
  } catch {
    return { rpID: 'localhost' }
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { username } = body as { username?: string }

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { rpID } = getRpInfo(origin)

  const admin = createAdminClient()

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = []

  if (username) {
    // Derive email from username (same logic as login page)
    const email = username.includes('@') ? username : `${username}@estetica.local`

    // Look up user
    const { data: { users } } = await admin.auth.admin.listUsers()
    const matchedUser = users.find((u) => u.email === email)

    if (matchedUser) {
      const { data: creds } = await admin
        .from('webauthn_credentials')
        .select('credential_id, transports')
        .eq('user_id', matchedUser.id)

      allowCredentials = (creds || []).map((c) => ({
        id: c.credential_id,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      }))
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: 'preferred',
  })

  // Save challenge (no user_id for pre-login challenges)
  const { data: challengeRow, error } = await admin
    .from('webauthn_challenges')
    .insert({ challenge: options.challenge, type: 'authentication' })
    .select('id')
    .single()

  if (error || !challengeRow) {
    return NextResponse.json({ error: 'Error al guardar challenge' }, { status: 500 })
  }

  return NextResponse.json({ options, challengeId: challengeRow.id })
}
