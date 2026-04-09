import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const role    = (session?.user as any)?.role

  // Public routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next()
  }

  // Admin routes — require admin role
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  }

  // Client routes — require any session
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
