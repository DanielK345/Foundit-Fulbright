import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register as registerApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

const VALID_DOMAINS = ['@fulbright.edu.vn', '@student.fulbright.edu.vn']

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', studentId: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!VALID_DOMAINS.some(d => form.email.endsWith(d))) {
      toast.error('Email must be a Fulbright address (@fulbright.edu.vn)')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await registerApi({ name: form.name, email: form.email, studentId: form.studentId, password: form.password })
      login(res.data)
      toast.success('Account created! Welcome to FoundIt!')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-gold flex-col items-center justify-center p-12">
        <div className="text-center text-white">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl font-bold" style={{ color: '#03045E' }}>F</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">FoundIt!</h1>
          <p className="text-lg text-white/80">Reuniting the Fulbright community</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Create account</h2>
            <p className="text-sm text-gray-500 mt-1">Fulbright email required</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input required value={form.name} onChange={set('name')}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="Your full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fulbright email</label>
              <input type="email" required value={form.email} onChange={set('email')}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="you@fulbright.edu.vn" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student ID <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={form.studentId} onChange={set('studentId')}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="e.g. FU2024001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={form.password} onChange={set('password')}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="Min. 6 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input type="password" required value={form.confirm} onChange={set('confirm')}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                placeholder="••••••••" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-full bg-brand-gold text-white font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner size="sm" color="white" /> : null}
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-gold font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
