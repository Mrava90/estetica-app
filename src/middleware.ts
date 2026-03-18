import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminEmail } from '@/lib/constants'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Archivos estáticos: nunca pasar por auth
  if (/\.(?:jpg|jpeg|png|gif|svg|ico|webp|css|js|woff2?|ttf|eot|otf|mp4|pdf)$/i.test(pathname)) {
    return NextResponse.next()
  }

  // Public routes that don't need auth
  const publicPaths = ['/login', '/reset-password', '/auth/confirm', '/reservar', '/api/citas', '/api/mis-turnos', '/api/whatsapp/webhook', '/api/cron', '/api/auth/webauthn']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // Static files and API routes that handle their own auth
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response = NextResponse.next({
              request: { headers: request.headers },
            })
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Staff users (@estetica.local) and admins can access dashboard
  // Client users (magic link with external email) go to mis-turnos
  const isStaff = user.email?.endsWith('@estetica.local') ?? false
  if (!isAdminEmail(user.email) && !isStaff) {
    const url = request.nextUrl.clone()
    url.pathname = '/reservar/mis-turnos'
    return NextResponse.redirect(url)
  }

  // If user came via password recovery link, force them to set a new password first
  const recoveryPending = request.cookies.get('recovery_pending')
  if (recoveryPending && !pathname.startsWith('/reset-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/reset-password'
    return NextResponse.redirect(url)
  }

  // Admin-only routes (staff can't access these)
  if (pathname.startsWith('/contabilidad') && !isAdminEmail(user.email)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
