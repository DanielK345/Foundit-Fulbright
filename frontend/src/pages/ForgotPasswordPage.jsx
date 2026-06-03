import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { forgotPassword, verifyResetCode, resetPassword } from '../api/auth'
import LoadingSpinner from '../components/LoadingSpinner'
import waterBottleCard from '../assets/water_bottle_card.png'

// Step 1: Enter email
function FindAccountStep({ onNext }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required'); return }
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email.trim())
      onNext(email.trim())
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-3xl font-bold text-gray-900 mb-1">Find Your Account</h2>
      <p className="text-sm text-gray-500 mb-6">Enter your email address.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="abc@fuv"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent text-sm"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-white font-semibold rounded-xl hover:bg-yellow-500 disabled:opacity-60 transition-all text-sm flex items-center justify-center gap-2"
        >
          {loading ? <><LoadingSpinner size="sm" color="white" /> Sending...</> : 'Continue'}
        </button>
      </form>
    </>
  )
}

// Step 2: Enter OTP code
function ConfirmCodeStep({ email, onNext, onBack }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code.trim()) { setError('Please enter the code'); return }
    setError('')
    setLoading(true)
    try {
      await verifyResetCode(email, code.trim())
      onNext(code.trim())
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      await forgotPassword(email)
    } catch {
      // silent
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <h2 className="text-3xl font-bold text-gray-900 mb-1">Confirm Your Account</h2>
      <p className="text-sm text-gray-500 mb-6">
        We sent a code to <strong>{email}</strong>. Enter that code to confirm your account.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          maxLength={6}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent text-sm tracking-widest text-center text-lg"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-white font-semibold rounded-xl hover:bg-yellow-500 disabled:opacity-60 transition-all text-sm flex items-center justify-center gap-2"
        >
          {loading ? <><LoadingSpinner size="sm" color="white" /> Verifying...</> : 'Continue'}
        </button>
      </form>

      <button
        onClick={handleResend}
        disabled={resending}
        className="mt-3 w-full py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all text-sm disabled:opacity-60"
      >
        {resending ? 'Resending...' : "Didn't get a code?"}
      </button>
    </>
  )
}

// Step 3: Set new password
function NewPasswordStep({ email, code }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError('')
    setLoading(true)
    try {
      await resetPassword(email, code, password)
      navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-3xl font-bold text-gray-900 mb-1">Create a new password</h2>
      <p className="text-sm text-gray-500 mb-6">
        You'll use this password to log in to your account. Use at least 6 letters and numbers.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full pr-10 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-white font-semibold rounded-xl hover:bg-yellow-500 disabled:opacity-60 transition-all text-sm flex items-center justify-center gap-2"
        >
          {loading ? <><LoadingSpinner size="sm" color="white" /> Saving...</> : 'Continue'}
        </button>
      </form>

      <button
        onClick={() => navigate('/login')}
        className="mt-3 w-full py-3 text-gray-500 font-medium text-sm hover:text-gray-700 transition-colors"
      >
        Skip
      </button>
    </>
  )
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-gold flex-col justify-between p-12 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <span className="font-bold text-xl" style={{ color: '#03045E' }}>F</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#03045E' }}>FoundIt Fulbright</span>
          </div>
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">Wellcome back!</h1>
            <p className="text-yellow-100 text-lg leading-relaxed">Help a peer or find what's yours</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-center flex-1">
          <div className="relative w-96 h-96">
            <img
              src={waterBottleCard}
              alt="Item card"
              className="absolute rounded-2xl object-cover"
              style={{ width: '1000px', top: '50px', left: '60px', transform: 'rotate(6deg)' }}
            />
            <img
              src={waterBottleCard}
              alt="Item card"
              className="absolute rounded-2xl object-cover"
              style={{ width: '1000px', top: '50px', left: '-100px', transform: 'rotate(-3deg)' }}
            />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {step === 1 && (
            <FindAccountStep
              onNext={(email) => { setEmail(email); setStep(2) }}
            />
          )}
          {step === 2 && (
            <ConfirmCodeStep
              email={email}
              onNext={(code) => { setCode(code); setStep(3) }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <NewPasswordStep email={email} code={code} />
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            Remember your password?{' '}
            <Link to="/login" className="text-brand-gold font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
