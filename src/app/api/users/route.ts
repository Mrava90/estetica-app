import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/constants'

async function isAdmin(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  // Check hardcoded admin emails
  if (isAdminEmail(user.email)) return true
  // Check app_metadata for admins that changed their email
  const adminClient = createAdminClient()
  const { data } = await adminClient.auth.admin.getUserById(user.id)
  return data?.user?.app_metadata?.is_admin === true
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }))

  return NextResponse.json({ users })
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, invite } = body

  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Invite flow: send email with magic link
  if (invite) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://estetica-app-three.vercel.app'
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/confirm`,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { status: 201 })
  }

  // Create with password
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Contraseña (mín 6 caracteres) requerida' }, { status: 400 })
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, password, newEmail } = body

  if (!userId) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (newEmail) {
    // Preserve is_admin flag if the user being changed is an admin
    const { data: existing } = await admin.auth.admin.getUserById(userId)
    const wasAdmin = isAdminEmail(existing?.user?.email) || existing?.user?.app_metadata?.is_admin === true
    const updatePayload: Record<string, unknown> = { email: newEmail }
    if (wasAdmin) {
      updatePayload.app_metadata = { ...(existing?.user?.app_metadata || {}), is_admin: true }
    }
    const { error } = await admin.auth.admin.updateUserById(userId, updatePayload)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Contraseña (mín 6 caracteres) requerida' }, { status: 400 })
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('id')

  if (!userId) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  // Prevent deleting admin
  const admin = createAdminClient()
  const { data: userData } = await admin.auth.admin.getUserById(userId)
  if (isAdminEmail(userData?.user?.email) || userData?.user?.app_metadata?.is_admin === true) {
    return NextResponse.json({ error: 'No podés eliminar al administrador' }, { status: 403 })
  }

  const { error } = await admin.auth.admin.deleteUser(userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
