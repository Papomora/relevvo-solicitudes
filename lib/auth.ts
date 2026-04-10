import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from '@/auth.config'
import { CLIENT_PIN_MAP } from '@/lib/constants'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'cliente-pin',
      name: 'Cliente PIN',
      credentials: {
        pin: { label: 'PIN', type: 'password' },
      },
      async authorize(credentials) {
        const pin = credentials?.pin as string
        if (!pin || pin.length !== 4) return null

        // Find the client whose PIN matches
        for (const [cliente, envKey] of Object.entries(CLIENT_PIN_MAP)) {
          const pinCorrecto = process.env[envKey]
          if (pinCorrecto && pin === pinCorrecto) {
            return { id: cliente, name: cliente, role: 'cliente' }
          }
        }
        return null
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
})
