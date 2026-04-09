'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('admin-password', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)

    if (res?.error) {
      setError('Credenciales incorrectas.')
    } else {
      router.push('/admin')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <p className="text-xs tracking-[0.25em] uppercase text-white/30 mb-2">Acceso</p>
          <h1 className="font-display italic text-4xl text-white font-bold leading-none">
            Admin<span className="text-magenta">.</span>
          </h1>
          <p className="text-white/30 text-sm mt-2">Solo equipo Relevvo</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@relevvostudio.com"
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
              required
            />
          </div>

          {error && (
            <p className="text-magenta text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Verificando…' : 'Ingresar al panel'}
          </button>
        </form>
      </div>
    </main>
  )
}
