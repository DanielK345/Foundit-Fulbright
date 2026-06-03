import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X, Eye, EyeOff, User, Clock, Tag, Pencil, Trash2 } from 'lucide-react'
import { getProfile, updateProfile, changePassword } from '../api/users'
import { getMyItems, deleteItem } from '../api/items'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/axios'

/* Generic avatar placeholder */
function DefaultAvatar({ size = 208 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#D6E4ED" />
      <circle cx="50" cy="38" r="18" fill="#B0C4D4" />
      <ellipse cx="50" cy="82" rx="26" ry="18" fill="#B0C4D4" />
    </svg>
  )
}

function StatusBadge({ item }) {
  const isClaimed = item.status === 'CLAIMED'
  const isPending = item.claimantId && !isClaimed
  const label = isClaimed ? 'Claimed' : isPending ? 'Pending' : item.itemType === 'FOUND' ? 'Active' : 'Active'
  const colors = isClaimed
    ? 'bg-gray-100 text-gray-500'
    : isPending
    ? 'bg-yellow-50 text-yellow-600'
    : 'bg-amber-50 text-amber-500'
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      {label}
    </span>
  )
}

export default function ProfilePage() {
  const { user: authUser } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [myItems, setMyItems] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Item filter
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const fileInputRef = useRef(null)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [profileRes, itemsRes] = await Promise.all([getProfile(), getMyItems()])
        setProfile(profileRes.data || profileRes)
        setMyItems(itemsRes.data || itemsRes)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    fetchAll()
  }, [])

  const openEdit = () => {
    setEditName(profile?.name || '')
    setAvatarFile(null)
    setAvatarPreview(null)
    setCurrentPassword('')
    setNewPassword('')
    setSaveError('')
    setSaveSuccess('')
    setEditOpen(true)
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    setSaveError('')
    setSaveSuccess('')

    // Validate password if user is trying to change it
    if (currentPassword || newPassword) {
      if (!currentPassword) { setSaveError('Enter your current password.'); return }
      if (!newPassword) { setSaveError('Enter a new password.'); return }
      if (newPassword.length < 6) { setSaveError('New password must be at least 6 characters.'); return }
    }

    setSaving(true)
    try {
      // 1. Upload avatar if selected
      let profilePictureUrl = profile?.profilePicture || ''
      if (avatarFile) {
        setUploadingAvatar(true)
        const formData = new FormData()
        formData.append('file', avatarFile)
        const uploadRes = await api.post('/upload', formData)
        profilePictureUrl = uploadRes.data.url
        setUploadingAvatar(false)
      }

      // 2. Update name + profile picture
      const updated = await updateProfile({ name: editName.trim(), profilePicture: profilePictureUrl })
      setProfile(updated.data || updated)

      // 3. Change password if filled
      if (currentPassword && newPassword) {
        const pwRes = await changePassword(currentPassword, newPassword)
        if (pwRes.data?.message && pwRes.data.message !== 'Password changed successfully') {
          setSaveError(pwRes.data.message)
          setSaving(false)
          return
        }
      }

      setSaveSuccess('Profile updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setAvatarFile(null)
      setTimeout(() => { setEditOpen(false); setSaveSuccess('') }, 1200)
    } catch (err) {
      setSaveSuccess('')
      setSaveError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (e, itemId) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to remove this item?')) return
    try {
      await deleteItem(itemId)
      setMyItems(prev => prev.filter(i => i.id !== itemId))
    } catch (err) {
      const msg = err.response?.data?.message || err.message || ''
      if (msg.toLowerCase().includes('claimed')) {
        alert('This item has already been claimed and cannot be deleted.')
      }
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const filteredItems = myItems.filter(item => {
    const matchSearch = item.name?.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'All'
      || (typeFilter === 'Lost' && item.itemType === 'LOST')
      || (typeFilter === 'Found' && item.itemType === 'FOUND')
    return matchSearch && matchType
  })

  const reportedCount = myItems.length
  const resolvedCount = myItems.filter(i => i.status === 'CLAIMED').length

  const displayName = profile?.name || authUser?.name || 'Username'
  const displayEmail = profile?.email || authUser?.email || ''
  const avatarSrc = profile?.profilePicture || null

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>

  return (
    <div className="h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
    <div className="max-w-7xl mx-auto px-6 py-4 flex gap-6 items-start h-full">

        {/* Left — profile card */}
        <div className="w-96 flex-shrink-0 h-full bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
          {/* Banner */}
          <div className="h-28 bg-white" />

          {/* Avatar — overlapping banner */}
          <div className="flex flex-col items-center -mt-12 px-6 pb-16">
            <div className="w-60 h-60 rounded-full overflow-hidden mb-3">
              {avatarSrc
                ? <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
                : <DefaultAvatar size={240} />
              }
            </div>
            <h2 className="text-base font-semibold text-gray-900 text-center">{displayName}</h2>
            <p className="text-xs text-gray-400 text-center mt-0.5 mb-8">{displayEmail}</p>

            {/* Edit button */}
            <button
              onClick={openEdit}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors mb-8"
            >
              <User size={14} />
              Edit Profile
            </button>

            {/* Stats */}
            <div className="flex gap-3 w-full">
              <div className="flex-1 border border-gray-100 rounded-xl p-2 flex flex-col items-center gap-0.5">
                <div className="w-4 h-4 rounded-full border flex items-center justify-center" style={{ borderColor: '#F5A623' }}>
                  <span className="text-[9px]" style={{ color: '#F5A623' }}>+</span>
                </div>
                <span className="text-base font-bold text-gray-800">{reportedCount}</span>
                <span className="text-[9px] font-medium text-gray-400 tracking-wide uppercase">Reported</span>
              </div>
              <div className="flex-1 border border-gray-100 rounded-xl p-2 flex flex-col items-center gap-0.5">
                <div className="w-4 h-4 rounded-full border flex items-center justify-center" style={{ borderColor: '#F5A623' }}>
                  <span className="text-[9px]" style={{ color: '#F5A623' }}>✓</span>
                </div>
                <span className="text-base font-bold text-gray-800">{resolvedCount}</span>
                <span className="text-[9px] font-medium text-gray-400 tracking-wide uppercase">Resolved</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — record history */}
        <div className="flex-1 h-full flex flex-col min-h-0">
          {/* Title */}
          <div className="mb-4">
            <h3 className="text-xl font-bold text-gray-900">My Activity</h3>
            <p className="text-sm text-gray-400 mt-0.5">Manage and track all items you've lost or found.</p>
          </div>

          {/* Search + Type filter in one bar */}
          <div className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2.5 mb-5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0 mr-2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your reported items (e.g., 'MacBook', 'Keys')..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-600 placeholder-gray-400"
            />
            <div className="flex h-full items-center gap-1 ml-3 pl-3 border-l border-gray-200">
              {['All', 'Found', 'Lost'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setTypeFilter(opt)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    typeFilter === opt ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Items list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 flex-1 overflow-y-auto min-h-0">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No items found.</p>
            ) : (
              filteredItems.map(item => {
                const isClaimed = item.status === 'CLAIMED'
                return (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/items/${item.id}`)}
                    className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <StatusBadge item={item} />
                      </div>
                      {!isClaimed && (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/items/${item.id}/edit`)}
                            className="p-1.5 text-gray-400 hover:text-brand-gold transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, item.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Tag size={11} />
                        <span>{item.itemType === 'FOUND' ? 'Found Item' : 'Lost Item'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={11} />
                        <span>Updated on {formatDate(item.datePosted)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
      {/* Edit Profile Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setEditOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg  font-bold text-gray-700 mb-5">Edit Profile</h2>

            {/* Avatar upload */}
            <div className="flex flex-col items-center mb-5">
              <div className="relative w-24 h-24 rounded-full overflow-hidden mb-2">
                {avatarPreview || avatarSrc
                  ? <img src={avatarPreview || avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                  : <DefaultAvatar size={96} />
                }
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity rounded-full"
                >
                  <Camera size={20} className="text-white" />
                </button>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-600 hover:underline"
              >
                {uploadingAvatar ? 'Uploading…' : 'Change photo'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Your name"
              />
            </div>

            <hr className="my-4 border-gray-100" />
            <p className="text-xs font-medium text-gray-500 mb-3">Change password <span className="font-normal">(leave blank to keep current)</span></p>

            {/* Current password */}
            <div className="mb-3 relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-7 text-gray-400">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* New password */}
            <div className="mb-3 relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-7 text-gray-400">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {saveError && <p className="text-xs text-red-600 mb-3">{saveError}</p>}
            {saveSuccess && <p className="text-xs text-green-600 mb-3">{saveSuccess}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#F5A623' }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
