import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { forgotPassword, verifyResetCode, resetPassword } from '../api/auth'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleStep1 = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword({ email })
      toast.success('OTP sent! Check your email (or the backend console).')
      setStep(2)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleStep2 = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await verifyResetCode({ email, code })
      toast.success('Code verified!')
      setStep(3)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  const handleStep3 = async (e) => {
    e.preventDefault()
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      await resetPassword({ email, code, newPassword: password })
      toast.success('Password reset! Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-brand-gold' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Forgot password</h2>
            <p className="text-sm text-gray-500 mb-6">Enter your Fulbright email and we'll send an OTP.</p>
            <form onSubmit={handleStep1} className="flex flex-col gap-4">
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="you@fulbright.edu.vn"
              />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-full bg-brand-gold text-white font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <LoadingSpinner size="sm" color="white" /> : null}
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Enter OTP</h2>
            <p className="text-sm text-gray-500 mb-6">Enter the 6-digit code sent to <strong>{email}</strong></p>
            <form onSubmit={handleStep2} className="flex flex-col gap-4">
              <input
                required value={code} onChange={e => setCode(e.target.value)}
                maxLength={6}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="000000"
              />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-full bg-brand-gold text-white font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <LoadingSpinner size="sm" color="white" /> : null}
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">New password</h2>
            <p className="text-sm text-gray-500 mb-6">Choose a strong password for your account.</p>
            <form onSubmit={handleStep3} className="flex flex-col gap-4">
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="New password"
              />
              <input
                type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="Confirm password"
              />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-full bg-brand-gold text-white font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <LoadingSpinner size="sm" color="white" /> : null}
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link to="/login" className="text-brand-gold hover:underline">Back to Sign in</Link>
        </p>
      </div>
    </div>
  )
}
