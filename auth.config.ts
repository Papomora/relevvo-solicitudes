import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'

export const authConfig: NextAuthConfig = {
  providers: [], // providers only needed in full auth.ts (Node.js)
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        session.user.name = token.name ?? null
      }
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const session = auth
      const role    = (session?.user as any)?.role
      const path    = nextUrl.pathname
      const isApi   = path.startsWith('/api/')

      // Always allow public routes and all API calls
      // (API routes do their own auth check via auth())
      if (
        isApi ||
        path.startsWith('/login') ||
        path.startsWith('/admin/login')
      ) {
        return true
      }

      // Admin pages — require admin role
      if (path.startsWith('/admin')) {
        if (role !== 'admin') {
          return NextResponse.redirect(new URL('/admin/login', nextUrl))
        }
        return true
      }

      // Redirect admin away from client pages
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', nextUrl))
      }

      // All other pages — require session
      if (!session) {
        return NextResponse.redirect(new URL('/login', nextUrl))
      }

      return true
    },
  },
}
