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

      // Always allow public routes
      if (
        path.startsWith('/login') ||
        path.startsWith('/admin/login') ||
        path.startsWith('/api/auth')
      ) {
        return true
      }

      // Admin routes — require admin role
      if (path.startsWith('/admin')) {
        if (role !== 'admin') {
          return NextResponse.redirect(new URL('/admin/login', nextUrl))
        }
        return true
      }

      // Block admin from client routes
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', nextUrl))
      }

      // All other routes — require session
      if (!session) {
        return NextResponse.redirect(new URL('/login', nextUrl))
      }

      return true
    },
  },
}
