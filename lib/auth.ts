import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { CLIENT_PIN_MAP } from '@/lib/constants'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'cliente-pin',
      name: 'Cliente PIN',
      credentials: {
        cliente: { label: 'Cliente', type: 'text' },
        pin:     { label: 'PIN',     type: 'password' },
      },
      async authorize(credentials) {
        const cliente = credentials?.cliente as string
        const pin     = credentials?.pin     as string
        if (!cliente || !pin) return null

        const envKey    = CLIENT_PIN_MAP[cliente]
        if (!envKey) return null

        const pinCorrecto = process.env[envKey]
        if (!pinCorrecto || pin !== pinCorrecto) return null

        return { id: cliente, name: cliente, role: 'cliente' }
      },
    }),

    Credentials({
      id: 'admin-password',
      name: 'Admin',
      credentials: {
        email:    { label: 'Email',      type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const email    = credentials?.email    as string
        const password = credentials?.password as string
        if (!email || !password) return null

        if (
          email    === process.env.ADMIN_USER &&
          password === process.env.ADMIN_PASSWORD
        ) {
          return { id: 'admin', name: 'Relevvo Studio', role: 'admin' }
        }
        return null
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.name = user.name   // preserve name explicitly
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        session.user.name = token.name ?? null  // always forward name from token
      }
      return session
    },
  },

  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
})
