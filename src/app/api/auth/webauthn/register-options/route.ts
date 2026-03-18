import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
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

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { rpID } = getRpInfo(origin)

  const admin = createAdminClient()

  // Get existing credentials to exclude
  const { data: existingCreds } = await admin
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id)

  const excludeCredentials = (existingCreds || []).map((c) => ({
    id: c.credential_id,
    transports: c.transports as AuthenticatorTransportFuture[] | undefined,
  }))

  const options = await generateRegistrationOptions({
    rpName: 'Kawirth',
    rpID,
    userName: user.email ?? user.id,
    userDisplayName: user.email?.split('@')[0] ?? 'Usuario',
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  // Save challenge
  const { data: challengeRow, error } = await admin
    .from('webauthn_challenges')
    .insert({ challenge: options.challenge, user_id: user.id, type: 'registration' })
    .select('id')
    .single()

  if (error || !challengeRow) {
    return NextResponse.json({ error: 'Error al guardar challenge' }, { status: 500 })
  }

  return NextResponse.json({ options, challengeId: challengeRow.id })
}
