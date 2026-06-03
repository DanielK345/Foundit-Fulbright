import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { register as registerApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import waterBottleCard from '../assets/water_bottle_card.png'

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', studentId: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { login: authLogin } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.email.trim()) { setError('Email is required'); return }
    if (!form.email.includes('@fulbright.edu.vn') && !form.email.includes('@student.fulbright.edu.vn')) {
      setError('Only @fulbright.edu.vn or @student.fulbright.edu.vn emails are accepted')
      return
    }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    try {
      const res = await registerApi({
        name: form.email.split('@')[0],
        email: form.email.trim().toLowerCase(),
        studentId: '',
        password: form.password,
      })
      authLogin(res.data)
      toast.success(`Welcome to FoundIt!, ${res.data.name}!`)
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Register error:', err)
      console.error('Response data:', err.response?.data)
      const msg = err.response?.data?.message
        || (typeof err.response?.data === 'string' ? err.response.data : null)
        || err.message
        || 'Registration failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Gold */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-gold flex-col justify-between p-12 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <span className="font-bold text-xl" style={{ color: '#03045E' }}>F</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#03045E' }}>FoundIt Fulbright</span>
          </div>

          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Welcome back!
            </h1>
            <p className="text-yellow-100 text-lg leading-relaxed">
              Help a peer or find what's yours
            </p>
          </div>
        </div>

        {/* Stacked water bottle card images */}
        <div className="relative z-10 flex items-center justify-center flex-1">
          <div className="relative w-96 h-96">
            {/* Back card */}
            <img
              src={waterBottleCard}
              alt="Item card"
              className="absolute rounded-2xl object-cover"
              style={{ width: '1000px', top: '50px', left: '60px', transform: 'rotate(6deg)' }}
            />
            {/* Front card */}
            <img
              src={waterBottleCard}
              alt="Item card"
              className="absolute rounded-2xl object-cover"
              style={{ width: '1000px', top: '50px', left: '-100px', transform: 'rotate(-3deg)' }}
            />
          </div>
        </div>
      </div>

      {/* Right panel - White form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-full bg-brand-gold flex items-center justify-center">
              <span className="font-bold text-lg" style={{ color: '#03045E' }}>F</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#03045E' }}>
              FoundIt Fulbright
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Create new account</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="abc@student.fulbright.edu.vn"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent text-sm transition-all"
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••••"
                  className="w-full px-4 pr-10 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent text-sm transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-gold text-white font-semibold rounded-xl hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-brand-gold focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" color="white" />
                  Creating account...
                </>
              ) : (
                'Register'
              )}
            </button>
          </form>

          <div className="mt-4">
            <Link
              to="/login"
              className="block w-full py-3 border border-brand-gold text-brand-gold font-semibold rounded-xl hover:bg-yellow-50 text-center text-sm transition-all"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
