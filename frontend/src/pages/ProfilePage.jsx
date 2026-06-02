import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, updateProfile, changePassword, getHistory } from '../api/users'
import { uploadImage } from '../api/items'
import { useAuth } from '../context/AuthContext'
import ItemCard from '../components/ItemCard'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { Edit2, Lock, Search, User, X } from 'lucide-react'

const ITEM_TYPES = ['All', 'FOUND', 'LOST']

export default function ProfilePage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')

  // Edit form state
  const [editForm, setEditForm] = useState({ name: '', bio: '' })
  const [newPassword, setNewPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    Promise.all([getProfile(), getHistory()])
      .then(([pRes, hRes]) => {
        setProfile(pRes.data)
        setHistory(hRes.data || [])
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  const openEdit = () => {
    setEditForm({ name: profile?.name || '', bio: profile?.bio || '' })
    setNewPassword('')
    setCurrentPassword('')
    setAvatarFile(null)
    setEditOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let profilePicture = profile?.profilePicture
      if (avatarFile) {
        const res = await uploadImage(avatarFile)
        profilePicture = res.data
      }
      const updatedRes = await updateProfile({ name: editForm.name, bio: editForm.bio, profilePicture })
      setProfile(updatedRes.data)

      if (newPassword) {
        if (!currentPassword) { toast.error('Enter current password to change password'); setSaving(false); return }
        await changePassword({ currentPassword, newPassword })
        toast.success('Password updated!')
      }

      // Update auth context with new user data
      const token = sessionStorage.getItem('token')
      login({ token, user: updatedRes.data })
      toast.success('Profile updated!')
      setEditOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const filteredItems = history.filter(item => {
    if (typeFilter !== 'All' && item.itemType !== typeFilter) return false
    if (search) return item.name?.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const reportedCount = history.length
  const resolvedCount = history.filter(i => i.status === 'CLAIMED').length

  if (loading) return <div className="flex justify-center py-24"><LoadingSpinner size="xl" /></div>

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
      {/* Left: profile card */}
      <div className="w-full lg:w-96 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {/* Avatar */}
          <div className="flex flex-col items-center text-center mb-6">
            {profile?.profilePicture ? (
              <img src={profile.profilePicture} alt="" className="w-20 h-20 rounded-full object-cover mb-3 border-2 border-brand-gold/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-gold/10 flex items-center justify-center mb-3">
                <User size={32} className="text-brand-gold" />
              </div>
            )}
            <h2 className="text-lg font-bold text-gray-900">{profile?.name}</h2>
            <p className="text-sm text-gray-500">{profile?.email}</p>
            {profile?.studentId && <p className="text-xs text-gray-400 mt-0.5">ID: {profile.studentId}</p>}
            {profile?.bio && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{profile.bio}</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-brand-navy">{reportedCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">Reported</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{resolvedCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">Resolved</p>
            </div>
          </div>

          <button onClick={openEdit}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-brand-gold text-brand-gold text-sm font-medium hover:bg-yellow-50 transition-colors">
            <Edit2 size={15} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Right: my items */}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold text-gray-900 mb-4">My Items</h2>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:border-brand-gold"
              placeholder="Search my items…"
            />
          </div>
          <div className="flex gap-1">
            {ITEM_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${typeFilter === t ? 'bg-brand-gold text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {t === 'All' ? 'All' : t === 'FOUND' ? 'Found' : 'Lost'}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">📦</p>
            <p className="text-sm">No items yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <ItemCard key={item.id} item={item} onDeleted={(id) => setHistory(prev => prev.filter(i => i.id !== id))} />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Edit Profile</h3>
              <button onClick={() => setEditOpen(false)} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  {avatarFile ? (
                    <img src={URL.createObjectURL(avatarFile)} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : profile?.profilePicture ? (
                    <img src={profile.profilePicture} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                      <User size={24} className="text-gray-400" />
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="text-xs text-brand-gold hover:underline">Change photo</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files[0] && setAvatarFile(e.target.files[0])} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea value={editForm.bio} onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold resize-none"
                  placeholder="Tell the community about yourself…" />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock size={14} className="text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium">Change password (optional)</p>
                </div>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                  placeholder="Current password" />
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                  placeholder="New password" />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-2.5 rounded-full bg-brand-gold text-white font-semibold flex items-center justify-center gap-2 hover:bg-yellow-500 transition-colors disabled:opacity-60">
                {saving ? <LoadingSpinner size="sm" color="white" /> : null}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
