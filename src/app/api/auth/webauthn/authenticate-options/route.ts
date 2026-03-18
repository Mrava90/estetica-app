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
  try {
    const body = await request.json().catch(() => ({}))
    const { username } = body as { username?: string }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const { rpID } = getRpInfo(origin)

    const admin = createAdminClient()

    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = []

    if (username) {
      const email = username.includes('@') ? username : `${username}@estetica.local`

      const listResult = await admin.auth.admin.listUsers()
      const users = listResult.data?.users ?? []
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

    const { data: challengeRow, error } = await admin
      .from('webauthn_challenges')
      .insert({ challenge: options.challenge, type: 'authentication' })
      .select('id')
      .single()

    if (error || !challengeRow) {
      return NextResponse.json({ error: `Error al guardar challenge: ${error?.message}` }, { status: 500 })
    }

    return NextResponse.json({ options, challengeId: challengeRow.id })
  } catch (err) {
    return NextResponse.json({ error: `Error interno: ${err}` }, { status: 500 })
  }
}
