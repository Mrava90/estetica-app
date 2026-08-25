import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Sanitiza el parametro `next` para evitar open redirect a dominios externos.
 * Solo permite rutas locales que empiecen con '/' y no sean protocol-relative ('//dominio').
 */
function sanitizeNext(next: string | null): string {
  const fallback = '/dashboard'
  if (!next) return fallback
  // Rechazar URLs absolutas y protocol-relative
  if (next.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(next)) return fallback
  // Solo aceptar rutas que empiecen con "/"
  if (!next.startsWith('/')) return fallback
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

  const supabase = await createClient()

  // Handle PKCE flow (code exchange) — used by resetPasswordForEmail with redirectTo /auth/confirm
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectUrl = new URL(next, request.url)
      const response = NextResponse.redirect(redirectUrl)
      // If this is a recovery flow, set a flag so middleware forces password change
      if (next === '/reset-password') {
        response.cookies.set('recovery_pending', '1', {
          path: '/',
          maxAge: 600,           // 10 min: si el flujo no se completa, expira solo
          httpOnly: false,       // necesario para que reset-password page la borre desde JS
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
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
