import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'

export default function ImageUpload({ onImageSelect, currentImage }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(currentImage || null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target.result)
    }
    reader.readAsDataURL(file)
    onImageSelect(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    setPreview(null)
    onImageSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors
        ${dragging ? 'border-brand-gold bg-orange-50' : 'border-gray-300 hover:border-brand-gold bg-gray-50'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {preview ? (
        <div className="relative">
          <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-red-50"
          >
            <X size={16} className="text-red-500" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
          <Upload size={28} />
          <p className="text-sm">Click or drag an image here</p>
          <p className="text-xs">Max 5MB · JPG, PNG, WEBP</p>
        </div>
      )}
    </div>
  )
}
