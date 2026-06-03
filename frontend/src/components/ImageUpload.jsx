import { useRef, useState } from 'react'
import { Upload, X, Image } from 'lucide-react'

export default function ImageUpload({ onImageSelect, currentImage, label = 'Photo Upload' }) {
  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState(currentImage || null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result
      setPreview(base64)
      onImageSelect && onImageSelect(base64)
    }
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e) => {
    const file = e.target.files[0]
    handleFileChange(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    handleFileChange(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const clearImage = () => {
    setPreview(null)
    onImageSelect && onImageSelect(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>

      {preview ? (
        <div className="relative w-full">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-48 object-cover rounded-lg border-2 border-gray-600"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            w-full h-48 border-2 border-dashed rounded-lg cursor-pointer
            flex flex-col items-center justify-center gap-3 transition-colors
            ${isDragging
              ? 'border-brand-gold bg-yellow-900/20'
              : 'border-gray-600 bg-gray-700/30 hover:border-brand-gold hover:bg-yellow-900/10'
            }
          `}
        >
          <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
            <Image size={24} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-gray-300 text-sm font-medium">Click to upload or drag & drop</p>
            <p className="text-gray-500 text-xs mt-1">PNG, JPG, GIF up to 5MB</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-brand-gold/20 rounded-lg border border-brand-gold/30">
            <Upload size={16} className="text-brand-gold" />
            <span className="text-brand-gold text-sm font-medium">Choose File</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  )
}

export function LightImageUpload({ onImageSelect, currentImage, label = 'Photo Upload' }) {
  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState(currentImage || null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result
      setPreview(base64)
      onImageSelect && onImageSelect(base64)
    }
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e) => {
    const file = e.target.files[0]
    handleFileChange(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileChange(e.dataTransfer.files[0])
  }

  const clearImage = () => {
    setPreview(null)
    onImageSelect && onImageSelect(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}
      {preview ? (
        <div className="relative w-full">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          className={`w-full h-40 border-2 border-dashed rounded-lg cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${
            isDragging ? 'border-brand-gold bg-yellow-50' : 'border-gray-300 hover:border-brand-gold hover:bg-yellow-50'
          }`}
        >
          <Upload size={24} className="text-gray-400" />
          <p className="text-sm text-gray-500">Click to upload or drag & drop</p>
          <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  )
}
