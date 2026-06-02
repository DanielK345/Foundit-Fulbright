import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getItem, updateItem, uploadImage } from '../api/items'
import ImageUpload from '../components/ImageUpload'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { ChevronLeft } from 'lucide-react'

const LOCATIONS = [
  'Main Building', 'Library', 'Cafeteria', 'Gym', 'Parking Lot',
  'Student Lounge', 'Auditorium', 'Science Lab', 'Computer Lab', 'Other'
]
const CATEGORIES = ['Electronics', 'Clothing', 'Accessories', 'Books', 'Stationery', 'Keys', 'Bag', 'ID/Card', 'Other']

export default function EditItemPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [newImageFile, setNewImageFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getItem(id)
      .then(res => {
        const d = res.data
        setForm({
          name: d.name || '',
          description: d.description || '',
          category: d.category || '',
          locationFound: d.locationFound || '',
          dateEvent: d.dateEvent || '',
          isPublic: d.isPublic !== false,
          imageUrl: d.imageUrl || '',
        })
      })
      .catch(() => toast.error('Item not found'))
      .finally(() => setLoading(false))
  }, [id])

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let imageUrl = form.imageUrl
      if (newImageFile) {
        const res = await uploadImage(newImageFile)
        const existing = form.imageUrl ? form.imageUrl.split('|').filter(Boolean) : []
        imageUrl = [...existing, res.data].join('|')
      }
      await updateItem(id, { ...form, imageUrl })
      toast.success('Item updated!')
      navigate(`/items/${id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const removeExistingImage = (url) => {
    const remaining = form.imageUrl.split('|').filter(u => u !== url)
    setForm(p => ({ ...p, imageUrl: remaining.join('|') }))
  }

  if (loading) return <div className="flex justify-center py-24"><LoadingSpinner size="xl" /></div>
  if (!form) return null

  const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"
  const existingImages = form.imageUrl ? form.imageUrl.split('|').filter(Boolean) : []

  return (
    <div className="max-w-xl mx-auto px-6 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
        <ChevronLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Item</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className={labelClass}>Item name *</label>
          <input required value={form.name} onChange={set('name')} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <select value={form.category} onChange={set('category')} className={inputClass}>
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3}
            className={inputClass + ' resize-none'} />
        </div>

        <div>
          <label className={labelClass}>Location</label>
          <select value={form.locationFound} onChange={set('locationFound')} className={inputClass}>
            <option value="">Select location…</option>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Date</label>
          <input type="date" value={form.dateEvent} onChange={set('dateEvent')} className={inputClass} />
        </div>

        {/* Existing images */}
        {existingImages.length > 0 && (
          <div>
            <label className={labelClass}>Current photos</label>
            <div className="flex gap-2 flex-wrap">
              {existingImages.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                  <button type="button" onClick={() => removeExistingImage(url)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add new image */}
        {!newImageFile ? (
          <div>
            <label className={labelClass}>Add photo</label>
            <ImageUpload onImageSelect={(f) => setNewImageFile(f)} />
          </div>
        ) : (
          <div>
            <label className={labelClass}>New photo</label>
            <div className="relative w-20">
              <img src={URL.createObjectURL(newImageFile)} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
              <button type="button" onClick={() => setNewImageFile(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <input type="checkbox" id="isPublic" checked={form.isPublic}
            onChange={e => setForm(p => ({ ...p, isPublic: e.target.checked }))}
            className="w-4 h-4 rounded text-brand-gold" />
          <label htmlFor="isPublic" className="text-sm font-medium text-gray-700 cursor-pointer">Make my contact info visible</label>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-full bg-brand-gold text-white font-semibold flex items-center justify-center gap-2 hover:bg-yellow-500 transition-colors disabled:opacity-60">
          {saving ? <LoadingSpinner size="sm" color="white" /> : null}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
