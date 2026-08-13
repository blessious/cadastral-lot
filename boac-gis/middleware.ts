import { NextResponse, type NextRequest } from 'next/server'

import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth-session'

function getRedirectUrl(request: NextRequest, pathname: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const host = forwardedHost || request.headers.get('host') || request.nextUrl.host
  const proto = forwardedProto || request.nextUrl.protocol.replace(':', '')

  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return new URL(pathname, `${proto}://${host}`)
  }

  if (process.env.PUBLIC_URL) {
    return new URL(pathname, process.env.PUBLIC_URL)
  }

  return new URL(pathname, request.url)
}

export async function middleware(request: NextRequest) {
  const isLoginRoute = request.nextUrl.pathname.startsWith('/login')
  const token = request.cookies.get(AUTH_COOKIE)?.value
  const session = await verifySessionToken(token)
  const authenticated = Boolean(session)

  if (authenticated && isLoginRoute) {
    return NextResponse.redirect(getRedirectUrl(request, '/'))
  }

  if (!authenticated && !isLoginRoute) {
    const response = NextResponse.redirect(getRedirectUrl(request, '/login'))
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
