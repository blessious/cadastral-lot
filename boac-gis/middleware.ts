import { NextResponse, type NextRequest } from 'next/server'

import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth-session'

export async function middleware(request: NextRequest) {
  const isLoginRoute = request.nextUrl.pathname.startsWith('/login')
  const token = request.cookies.get(AUTH_COOKIE)?.value
  const session = await verifySessionToken(token)
  const authenticated = Boolean(session)

  if (authenticated && isLoginRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!authenticated && !isLoginRoute) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    if (token) response.cookies.delete(AUTH_COOKIE)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
