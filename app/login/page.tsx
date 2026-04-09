'use client'

import { useState, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { CLIENTES } from '@/lib/constants'

export default function LoginPage() {
  const router      = useRouter()
  const [cliente, setCliente] = useState('')
  const [pin, setPin]         = useState(['', '', '', ''])
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs             = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  function handlePinInput(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    if (value && index < 3) inputRefs[index + 1].current?.focus()
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cliente) { setError('Selecciona tu marca'); return }
    const pinStr = pin.join('')
    if (pinStr.length < 4) { setError('Ingresa tu PIN de 4 dígitos'); return }

    setLoading(true)
    const res = await signIn('cliente-pin', {
      cliente,
      pin: pinStr,
      redirect: false,
    })
    setLoading(false)

    if (res?.error) {
      setError('PIN incorrecto. Contacta a Relevvo Studio.')
      setPin(['', '', '', ''])
      inputRefs[0].current?.focus()
    } else {
      router.push('/solicitudes')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.png" alt="Relevvo Studio" className="h-14 object-contain" />
          <p className="text-xs tracking-[0.25em] uppercase text-white/30 mt-4">Portal de clientes</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-7">
          <div>
            <label className="label">Tu marca</label>
            <select
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              className="input"
            >
              <option value="">Selecciona tu marca…</option>
              {CLIENTES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">PIN de acceso</label>
            <div className="flex gap-3 justify-center mt-2">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={inputRefs[i]}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinInput(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  className="pin-input"
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-magenta text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          ¿No tienes acceso?{' '}
          <a
            href="https://wa.me/573223094005"
            target="_blank"
            rel="noopener noreferrer"
            className="text-magenta/60 hover:text-magenta transition-colors"
          >
            Escríbenos
          </a>
        </p>
      </div>
    </main>
  )
}
