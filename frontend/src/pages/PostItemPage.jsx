import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { reportFound, reportLost, uploadImage } from '../api/items'
import ImageUpload from '../components/ImageUpload'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { MapPin } from 'lucide-react'

const LOCATIONS = [
  'Main Building', 'Library', 'Cafeteria', 'Gym', 'Parking Lot',
  'Student Lounge', 'Auditorium', 'Science Lab', 'Computer Lab', 'Other'
]
const CATEGORIES = ['Electronics', 'Clothing', 'Accessories', 'Books', 'Stationery', 'Keys', 'Bag', 'ID/Card', 'Other']

export default function PostItemPage() {
  const location = useLocation()
  const isLost = location.pathname.includes('/lost')
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '', description: '', category: '', locationFound: '', dateEvent: '', isPublic: true
  })
  const [imageFiles, setImageFiles] = useState([])
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleImageSelect = (file) => {
    setImageFiles(prev => [...prev, file])
  }

  const removeImage = (idx) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Please enter the item name'); return }
    setLoading(true)

    try {
      let imageUrl = ''
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(f => uploadImage(f))
        const uploadResults = await Promise.all(uploadPromises)
        imageUrl = uploadResults.map(r => r.data).join('|')
      }

      const payload = { ...form, imageUrl, isPublic: form.isPublic === true || form.isPublic === 'true' }
      if (isLost) {
        await reportLost(payload)
        toast.success('Lost item reported!')
      } else {
        await reportFound(payload)
        toast.success('Found item reported!')
      }
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post item')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="max-w-xl mx-auto px-6 py-6">
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-6 ${isLost ? 'bg-red-100 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
        {isLost ? '🔴 Report Lost Item' : '🟡 Report Found Item'}
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isLost ? 'I lost something' : 'I found something'}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Item name */}
        <div>
          <label className={labelClass}>Item name *</label>
          <input required value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. Black AirPods Pro" />
        </div>

        {/* Category */}
        <div>
          <label className={labelClass}>Category</label>
          <select value={form.category} onChange={set('category')} className={inputClass}>
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3}
            className={inputClass + ' resize-none'}
            placeholder="Describe the item — brand, color, distinctive features…" />
        </div>

        {/* Location */}
        <div>
          <label className={labelClass}>{isLost ? 'Last seen location' : 'Where found'}</label>
          <select value={form.locationFound} onChange={set('locationFound')} className={inputClass}>
            <option value="">Select location…</option>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className={labelClass}>Date {isLost ? 'lost' : 'found'}</label>
          <input type="date" value={form.dateEvent} onChange={set('dateEvent')} className={inputClass} />
        </div>

        {/* Images */}
        <div>
          <label className={labelClass}>Photos <span className="text-gray-400 font-normal">(up to 3)</span></label>
          {imageFiles.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {imageFiles.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</button>
                </div>
              ))}
            </div>
          )}
          {imageFiles.length < 3 && (
            <ImageUpload onImageSelect={handleImageSelect} />
          )}
        </div>

        {/* Privacy toggle */}
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <input
            type="checkbox"
            id="isPublic"
            checked={form.isPublic === true}
            onChange={e => setForm(p => ({ ...p, isPublic: e.target.checked }))}
            className="w-4 h-4 rounded text-brand-gold"
          />
          <div>
            <label htmlFor="isPublic" className="text-sm font-medium text-gray-700 cursor-pointer">Make my contact info visible</label>
            <p className="text-xs text-gray-400 mt-0.5">Others can see your name and email</p>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className={`w-full py-3 rounded-full text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${isLost ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-gold hover:bg-yellow-500'}`}>
          {loading ? <LoadingSpinner size="sm" color="white" /> : null}
          {loading ? 'Posting…' : isLost ? 'Post Lost Report' : 'Post Found Report'}
        </button>
      </form>
    </div>
  )
}
