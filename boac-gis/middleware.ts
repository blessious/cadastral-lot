import { NextResponse, type NextRequest } from 'next/server'

const AUTH_COOKIE = 'boac_gis_auth'

export async function middleware(request: NextRequest) {
  const isLoginRoute = request.nextUrl.pathname.startsWith('/login')
  const hasAuth = request.cookies.get(AUTH_COOKIE)?.value === '1'

  if (!hasAuth && !isLoginRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}