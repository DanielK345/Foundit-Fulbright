import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Upload, X } from 'lucide-react'
import { reportFound, reportLost, uploadImage } from '../api/items'
import LoadingSpinner from '../components/LoadingSpinner'

const LOCATIONS = [
  'Common Area GF', 'Library', 'Maker Space',
  'Classroom 1', 'Classroom 2', 'Classroom 3', 'Classroom 4',
  'Classroom 5', 'Classroom 6', 'Classroom 7', 'Other',
]

export default function PostItemPage() {
  const location = useLocation()
  const isFound = !location.pathname.includes('/lost')
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    name: '', description: '', category: '',
    locationFound: '', date: '', isPublic: 'Yes',
  })
  const [imageFiles, setImageFiles] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setError('Please select image files only.'); return }
      if (file.size > 10 * 1024 * 1024) { setError('Each image must be smaller than 10MB.'); return }
    }
    setError('')
    setImageFiles(prev => [...prev, ...files])
    setImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!form.name.trim()) { setError('Item name is required.'); return }
    setError('')

    let imageUrl = ''
    if (imageFiles.length > 0) {
      setUploading(true)
      try {
        const urls = await Promise.all(imageFiles.map(async (file) => {
          const res = await uploadImage(file)
          return res.data.url
        }))
        imageUrl = urls.join('|')
      } catch {
        setError('Failed to upload images. Please try again.')
        setUploading(false)
        return
      }
      setUploading(false)
    }

    setSubmitting(true)
    try {
      const submit = isFound ? reportFound : reportLost
      const res = await submit({
        name: form.name,
        description: form.description,
        category: form.category,
        locationFound: form.locationFound,
        imageUrl,
        dateEvent: form.date || null,
        isPublic: form.isPublic !== 'No',
      })
      const item = res.data || res
      navigate(`/items/${item.id}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-4 py-2.5 border border-gray-200 rounded-full text-sm text-gray-700 outline-none focus:border-gray-400 bg-white appearance-none'
  const labelCls = 'block text-sm text-gray-700 mb-2'

  return (
    <div className="bg-gray-50 flex items-start justify-center pt-0 pb-10 px-6">
      <div className="w-full max-w-7xl">

        {/* Card */}
        <div className="px-10 pt-8 pb-10">
          <p className="text-left text-base font-medium mb-6 text-gray-800">
            {isFound
              ? 'Fill this form to report the items that you found'
              : 'Fill this form to report the items that you lost'}
          </p>
          <form onSubmit={handleSubmit}>

            {/* 2-column: left fields + right description */}
            <div className="grid grid-cols-2 gap-20 mb-5">

              {/* Left column */}
              <div className="flex flex-col gap-5">
                <div>
                  <label className={labelCls}>Item Name</label>
                  <input
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. Student card, Laptop..."
                  />
                </div>
                <div>
                  <label className={labelCls}>Location</label>
                  <div className="relative">
                    <select
                      name="locationFound"
                      value={form.locationFound}
                      onChange={handleChange}
                      className={inputCls}
                    >
                      <option value=""></option>
                      {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{isFound ? 'Date Found' : 'Date Lost'}</label>
                  <div className="relative">
                    <input
                      name="date"
                      type="date"
                      value={form.date}
                      onChange={handleChange}
                      max={new Date().toISOString().split('T')[0]}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Do you want to public your name on this post?</label>
                  <div className="relative">
                    <select
                      name="isPublic"
                      value={form.isPublic}
                      onChange={handleChange}
                      className={inputCls}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right column — description */}
              <div className="flex flex-col">
                <label className={labelCls}>Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="flex-1 w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm text-gray-700 outline-none focus:border-gray-400 bg-white resize-none"
                  style={{ minHeight: '220px' }}
                  placeholder="Describe the item — colour, brand, distinguishing features..."
                />
              </div>
            </div>

            {/* Photo Upload — full width below */}
            <div className="mb-2">
              <label className={labelCls}>Photo Upload</label>
              {imagePreviews.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3">
                  {imagePreviews.map((src, i) => (
                    <div key={i} className="relative border border-gray-200 rounded-2xl overflow-hidden" style={{ width: '120px', height: '100px' }}>
                      <img src={src} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 border border-gray-200 rounded-full text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors bg-white"
              >
                <Upload size={15} />
                {imagePreviews.length > 0 ? 'Add More Images' : 'Upload Images'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

            {/* Submit button */}
            <div className="flex justify-center mt-6">
              <button
                onClick={handleSubmit}
                disabled={submitting || uploading}
                className="px-12 py-2.5 rounded-full text-sm font-bold disabled:opacity-60 transition-opacity hover:opacity-90 flex items-center gap-2 whitespace-nowrap"
                style={{ backgroundColor: '#F5A623', color: '#ffffff' }}
              >
                {uploading ? <><LoadingSpinner size="sm" color="white" /> Uploading...</>
                 : submitting ? <><LoadingSpinner size="sm" color="white" /> Submitting...</>
                 : 'Submit'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
