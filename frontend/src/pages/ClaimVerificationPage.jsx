import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { claimWithVerification } from '../api/items'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { ChevronLeft, Shield } from 'lucide-react'

export default function ClaimVerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ itemNameGuess: '', locationGuess: '', dateLost: '', description: '' })
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemNameGuess.trim() || !form.description.trim()) {
      toast.error('Please fill in required fields')
      return
    }
    setLoading(true)
    try {
      await claimWithVerification(id, form)
      toast.success('Verification submitted! The finder will review your claim.')
      navigate(`/items/${id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit verification')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
  const labelClass = "block text-sm font-medium text-gray-300 mb-1"

  return (
    <div className="min-h-screen bg-gray-900 text-white px-6 py-8">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors">
          <ChevronLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center">
            <Shield size={20} className="text-brand-gold" />
          </div>
          <h1 className="text-xl font-bold">Prove Ownership</h1>
        </div>
        <p className="text-sm text-gray-400 mb-8">
          To claim a valuable item, describe it in detail. Our system will score your answer — you need at least 50% accuracy to submit a claim.
        </p>

        <div className="bg-gray-800 rounded-2xl p-4 mb-8">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">How scoring works</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-300">Item name match</span><span className="text-brand-gold font-medium">40 pts</span></div>
            <div className="flex justify-between"><span className="text-gray-300">Location match</span><span className="text-brand-gold font-medium">30 pts</span></div>
            <div className="flex justify-between"><span className="text-gray-300">Description match</span><span className="text-brand-gold font-medium">30 pts</span></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className={labelClass}>What is the item? *</label>
            <input required value={form.itemNameGuess} onChange={set('itemNameGuess')}
              className={inputClass + ' bg-gray-800 border-gray-700 text-white placeholder-gray-500'}
              placeholder="e.g. Black AirPods Pro, Case with stickers" />
          </div>

          <div>
            <label className={labelClass}>Where did you lose it?</label>
            <input value={form.locationGuess} onChange={set('locationGuess')}
              className={inputClass + ' bg-gray-800 border-gray-700 text-white placeholder-gray-500'}
              placeholder="e.g. Library, 2nd floor study room" />
          </div>

          <div>
            <label className={labelClass}>When did you lose it?</label>
            <input type="date" value={form.dateLost} onChange={set('dateLost')}
              className={inputClass + ' bg-gray-800 border-gray-700 text-white'} />
          </div>

          <div>
            <label className={labelClass}>Describe your item in detail *</label>
            <textarea required value={form.description} onChange={set('description')} rows={4}
              className={inputClass + ' bg-gray-800 border-gray-700 text-white placeholder-gray-500 resize-none'}
              placeholder="Serial number, engravings, stickers, color, model — the more detail the better" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-full bg-brand-gold text-white font-semibold flex items-center justify-center gap-2 hover:bg-yellow-500 transition-colors disabled:opacity-60">
            {loading ? <LoadingSpinner size="sm" color="white" /> : null}
            {loading ? 'Submitting…' : 'Submit Claim'}
          </button>
        </form>
      </div>
    </div>
  )
}
