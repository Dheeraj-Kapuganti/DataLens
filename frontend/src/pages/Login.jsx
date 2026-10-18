
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { refreshUser } = useAuth()
  const navigate = useNavigate()

  async function requestOtp(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { default: api } = await import('../services/api')
      const response = await api.post('/auth/request-otp', { email })

      setOtpSent(true)
      setMessage(response.data.message || 'Check your email for the login code.')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the login code.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { default: api } = await import('../services/api')
      await api.post('/auth/verify-otp', { email, otp })

      const user = await refreshUser()

      if (!user) {
        setError('Login succeeded, but the session could not be verified. Please try again.')
        return
      }

      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Could not verify the code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111113] px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#19191d] p-8 shadow-2xl">
        <div className="mb-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-xl font-bold text-black">
            D
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to DataLens</h1>
          <p className="mt-2 text-sm text-gray-400">
            Sign in securely with your email.
          </p>
        </div>

        <form onSubmit={otpSent ? verifyOtp : requestOtp} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-gray-300">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading || otpSent}
              className="w-full rounded-lg border border-white/10 bg-[#111113] px-4 py-3 text-sm outline-none transition focus:border-amber-400 disabled:opacity-60"
            />
          </div>

          {otpSent && (
            <div>
              <label htmlFor="otp" className="mb-2 block text-sm text-gray-300">
                Six-digit verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                required
                className="w-full rounded-lg border border-white/10 bg-[#111113] px-4 py-3 text-center text-xl tracking-[0.4em] outline-none transition focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false)
                  setOtp('')
                  setError('')
                  setMessage('')
                }}
                className="mt-2 text-sm text-amber-300 hover:text-amber-200"
              >
                Use a different email
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? 'Please wait...'
              : otpSent
                ? 'Verify and sign in'
                : 'Send login code'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          No password needed. Your code expires in 5 minutes.
        </p>
      </div>
    </main>
  )
}
