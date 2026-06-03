import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Upload, X } from 'lucide-react'
import { getItem, claimWithVerification, uploadImage } from '../api/items'
import LoadingSpinner from '../components/LoadingSpinner'

const LOCATIONS = [
  'Common Area GF', 'Library', 'Maker Space',
  'Classroom 1', 'Classroom 2', 'Classroom 3', 'Classroom 4',
  'Classroom 5', 'Classroom 6', 'Classroom 7', 'Other',
]

export default function ClaimVerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ name: '', location: '', date: '', description: '' })
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)

  useEffect(() => {
    getItem(id)
      .then(res => setItem(res.data || res))
      .catch(() => setError('Failed to load item details.'))
      .finally(() => setLoading(false))
  }, [id])

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Image must be smaller than 10MB.'); return }
    setError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImagePreview(null)
    setImageFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!form.name.trim()) { setError('Item name is required.'); return }
    setError('')

    let imageUrl = ''
    if (imageFile) {
      setUploading(true)
      try {
        const uploadRes = await uploadImage(imageFile)
        imageUrl = uploadRes.data.url
      } catch {
        setError('Failed to upload image. Please try again.')
        setUploading(false)
        return
      }
      setUploading(false)
    }

      try {
    setSubmitting(true)

    const res = await claimWithVerification(id, {
      name: form.name,
      location: form.location,
      description: form.description,
      imageUrl,
    })

    const verificationResult = res.data || res

    if (verificationResult.matched === true) {
      setResult('matched')
    } else {
      setResult('no_match')
    }
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to submit. Please try again.')
  } finally {
    setSubmitting(false)
  }
    }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>

  if (result === 'matched') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 px-10 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#03045E' }}>High Chance Match!</h2>
          <p className="text-gray-500 mb-6 text-sm">There is a high chance your item matches this found item. The finder has been notified — contact them to discuss and confirm.</p>
          <button
            onClick={() => navigate(`/chat/${item?.reporterId}?itemId=${id}`)}
            className="px-10 py-2.5 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#F5A623' }}
          >
            Chat with Finder
          </button>
        </div>
      </div>
    )
  }

  if (result === 'no_match') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 px-10 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#03045E' }}>No Match Found</h2>
          <p className="text-gray-500 mb-6 text-sm">Your description did not match the item record. This might not be the right item.</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setResult(null)}
              className="px-8 py-2.5 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#03045E' }}
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-8 py-2.5 rounded-full text-sm font-semibold text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full px-4 py-2.5 border border-gray-200 rounded-full text-sm text-gray-700 outline-none focus:border-gray-400 bg-white appearance-none'
  const labelCls = 'block text-sm text-gray-700 mb-2'

  return (
    <div className="bg-gray-50 flex items-start justify-center pt-0 pb-10 px-6">
      <div className="w-full max-w-7xl">

        <div className="px-10 pt-8 pb-10">
          <p className="text-center text-base font-medium mb-1 text-gray-800">
            Fill this form to verify your claim
          </p>
          {item && (
            <p className="text-center text-sm text-gray-400 mb-6">
              Claiming: <span className="font-semibold text-gray-600">{item.name}</span>
            </p>
          )}

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
                    placeholder="e.g. Laptop, iPhone..."
                  />
                </div>
                <div>
                  <label className={labelCls}>Location</label>
                  <div className="relative">
                    <select
                      name="location"
                      value={form.location}
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
                  <label className={labelCls}>Date Lost</label>
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
                  placeholder="Describe the item — colour, brand, any marks or features that identify it as yours..."
                />
              </div>
            </div>

            {/* Photo Upload — full width below */}
            <div className="mb-2">
              <label className={labelCls}>Photo Upload (If available)</label>
              {imagePreview ? (
                <div className="relative w-full border border-gray-200 rounded-2xl overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-40 object-contain bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 border border-gray-200 rounded-full text-sm text-gray-500 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors bg-white"
                >
                  <Upload size={15} />
                  Upload Image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

            {/* Submit button */}
            <div className="flex justify-center mt-6">
              <button
                  type="submit"
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
