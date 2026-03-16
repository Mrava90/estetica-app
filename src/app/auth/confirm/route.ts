import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  const supabase = await createClient()

  // Handle PKCE flow (code exchange) — used by resetPasswordForEmail with redirectTo /auth/confirm
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectUrl = new URL(next, request.url)
      const response = NextResponse.redirect(redirectUrl)
      // If this is a recovery flow, set a flag so middleware forces password change
      if (next === '/reset-password') {
        response.cookies.set('recovery_pending', '1', { path: '/', maxAge: 600, httpOnly: false })
      }
      return response
    }
  }

  // Handle token hash verification (email OTP / direct link from Supabase email template)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(new URL('/reset-password', request.url))
      }
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
}
