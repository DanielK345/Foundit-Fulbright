import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, MoreVertical, Edit2, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { claimSimple, deleteItem, markLostItemRecovered } from '../api/items'
import StatusBadge from './StatusBadge'
import toast from 'react-hot-toast'

const VALUABLE_KEYWORDS = ['phone', 'laptop', 'wallet', 'smartwatch', 'tablet',
  'airpod', 'ipad', 'macbook', 'iphone', 'samsung', 'watch', 'camera']

function isValuable(name = '') {
  const lower = name.toLowerCase()
  return VALUABLE_KEYWORDS.some(k => lower.includes(k))
}

export default function ItemCard({ item: initialItem, onDeleted }) {
  const [item, setItem] = useState(initialItem)
  const [menuOpen, setMenuOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const isOwner = user && item.reporterEmail === user.email
  const firstImage = item.imageUrl?.split('|')[0]
  const valuable = isValuable(item.name)

  const handleCardClick = () => navigate(`/items/${item.id}`)

  const handleClaim = async (e) => {
    e.stopPropagation()
    if (valuable) {
      navigate(`/claim/${item.id}`)
      return
    }
    setClaiming(true)
    try {
      const res = await claimSimple(item.id)
      setItem(res.data)
      toast.success('Claim request sent!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to claim')
    } finally {
      setClaiming(false)
    }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try {
      await deleteItem(item.id)
      toast.success('Item deleted')
      onDeleted?.(item.id)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete this item')
    }
  }

  const handleRecover = async (e) => {
    e.stopPropagation()
    try {
      const res = await markLostItemRecovered(item.id)
      setItem(res.data)
      toast.success('Marked as recovered!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update')
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden flex flex-col"
    >
      {/* Image */}
      <div className="relative h-36 bg-gray-100 flex-shrink-0">
        {firstImage ? (
          <img src={firstImage} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl select-none">
            📦
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusBadge status={item.status} />
        </div>

        {/* Kebab menu for owner */}
        {isOwner && item.status !== 'CLAIMED' && (
          <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(p => !p)}
              className="bg-white rounded-full p-1 shadow hover:bg-gray-100"
            >
              <MoreVertical size={16} className="text-gray-600" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); navigate(`/items/${item.id}/edit`) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-xl"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-xl"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">{item.name}</h3>
        {item.locationFound && (
          <p className="flex items-center gap-1 text-xs text-gray-500 line-clamp-1">
            <MapPin size={11} /> {item.locationFound}
          </p>
        )}
        <p className="text-xs text-gray-400">
          by {item.reporterName || 'Anonymous Member'}
        </p>

        {/* Actions */}
        <div className="mt-auto pt-2" onClick={e => e.stopPropagation()}>
          {isOwner && item.itemType === 'LOST' && item.status === 'LOST' && (
            <button
              onClick={handleRecover}
              className="w-full text-xs py-1.5 rounded-full border border-brand-gold text-brand-gold hover:bg-orange-50 transition-colors"
            >
              Mark Recovered
            </button>
          )}
          {!isOwner && item.status === 'FOUND' && (
            item.currentUserHasPendingClaim ? (
              <span className="block text-center text-xs text-gray-400 py-1.5">Claim Pending</span>
            ) : (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full text-xs py-1.5 rounded-full bg-brand-gold text-white hover:bg-yellow-500 transition-colors disabled:opacity-50"
              >
                {valuable ? 'Verify Ownership' : claiming ? 'Claiming…' : 'Claim'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
