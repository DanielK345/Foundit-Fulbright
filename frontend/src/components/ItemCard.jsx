import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Package, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { claimSimple, deleteItem, markLostItemRecovered } from '../api/items'

const VALUABLE_KEYWORDS = [
  'phone', 'laptop', 'wallet', 'smartwatch', 'tablet', 'airpod',
  'ipad', 'macbook', 'iphone', 'samsung', 'watch', 'camera',
]

function isValuableItem(name) {
  if (!name) return false
  const lower = name.toLowerCase()
  return VALUABLE_KEYWORDS.some(k => lower.includes(k))
}

export default function ItemCard({ item: initialItem }) {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const [item, setItem] = useState(initialItem)
  const [claiming, setClaiming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!item) return null

  const {
    id,
    name,
    locationFound,
    status,
    description,
    imageUrl,
    reporterName,
    reporterId,
    datePosted,
    itemType,
    claimantId,
    claimantName,
    isPublic,
  } = item

  const rawName = name || 'Unknown Item'
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
  const isFound = status?.toUpperCase() === 'FOUND' || itemType?.toUpperCase() === 'FOUND'
  const isClaimed = status?.toUpperCase() === 'CLAIMED'
  const isOwnItem = user && (String(reporterId) === String(user.id))
  const valuable = isValuableItem(name)

  const hidePrivateDetails = valuable && isFound && !isOwnItem && !isClaimed

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })
    } catch { return '' }
  }

  const isClaimedByMe = isClaimed && user && String(user.id) === String(claimantId)
  const isAnonymous = isPublic === false && !isOwnItem

  const headerTitle = isFound ? 'Found Item' : 'Lost Item'
  const byName = isOwnItem
    ? 'you'
    : isAnonymous
    ? 'Anonymous Member'
    : (reporterName || 'Unknown')

  const hasPendingClaim = item.currentUserHasPendingClaim && !isClaimed

  const showChat = isAuthenticated && !isOwnItem && !isClaimed
  const showClaim =
    isAuthenticated &&
    !isOwnItem &&
    isFound &&
    !isClaimed &&
    !hasPendingClaim
  const isLost = itemType?.toUpperCase() === 'LOST'
  const showRecoveredButton = isAuthenticated && isOwnItem && isLost && !isClaimed

  const handleClaimClick = async (e) => {
  e.stopPropagation()

  if (!isAuthenticated) {
    navigate('/login')
    return
  }

  if (valuable) {
    navigate(`/claim/${id}`)
    return
  }

  try {
    setClaiming(true)

    const res = await claimSimple(id)

    setItem({
      ...(res.data || res),
      currentUserHasPendingClaim: true,
    })
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to send claim request.')
  } finally {
    setClaiming(false)
  }
}

  const handleRecoveredClick = async (e) => {
    e.stopPropagation()

    if (!window.confirm('Mark this lost item as recovered?')) return

    try {
      setClaiming(true)
      const res = await markLostItemRecovered(id)
      setItem(res.data || res)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update item status.')
    } finally {
      setClaiming(false)
    }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    try {
      await deleteItem(id)
      setDeleted(true)
    } catch { /* silently fail */ }
  }

  if (deleted) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">

      {/* Header row */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="w-7 h-7 rounded-full bg-brand-gold flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">
            {reporterName?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{headerTitle}</p>
          <p className="text-[10px] text-gray-400 truncate">
            Posted at {formatDate(datePosted)} by {byName}
          </p>
        </div>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className="text-gray-400 hover:text-gray-600 p-0.5"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50" onClick={e => e.stopPropagation()}>
              {isOwnItem && !isClaimed && (
                <>
                  <button
                    onClick={() => { setMenuOpen(false); navigate(`/items/${id}/edit`) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image */}
      {!hidePrivateDetails ? (
        <div className="bg-gray-100 cursor-pointer" style={{ height: '160px' }} onClick={() => navigate(`/items/${id}`)}>
          {imageUrl ? (
            <img
              src={imageUrl.split('|')[0]}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextElementSibling.style.display = 'flex'
              }}
            />
          ) : null}
          <div className={`w-full h-full flex flex-col items-center justify-center bg-gray-100 ${imageUrl ? 'hidden' : 'flex'}`}>
            <Package size={36} className="text-gray-300" />
            <span className="text-xs text-gray-400 mt-1">No image</span>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 cursor-pointer flex flex-col items-center justify-center" style={{ height: '160px' }} onClick={() => navigate(`/items/${id}`)}>
          <Package size={36} className="text-gray-300" />
          <span className="text-xs text-gray-400 mt-2 px-4 text-center">Image hidden for valuable item</span>
        </div>
      )}

      {/* Content */}
      <div className="px-3 pt-3 pb-3 flex flex-col gap-2 flex-1">

        {/* Name + Chat */}
        <div className="flex items-center gap-2">
          <h3
            className="font-bold text-gray-900 text-base flex-1 truncate cursor-pointer"
            onClick={() => navigate(`/items/${id}`)}
          >
            {displayName}
          </h3>
          {showChat && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/chat/${reporterId}?itemId=${id}${isAnonymous ? '&anonymous=true' : ''}`) }}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white rounded-full whitespace-nowrap hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#03045E' }}
            >
              Chat
            </button>
          )}
        </div>

        {/* Location */}
        {locationFound && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin size={12} className="text-brand-gold flex-shrink-0" />
            <span className="truncate">{locationFound}</span>
          </div>
        )}

        {/* Description */}
        {description && !hidePrivateDetails && (
          <p className="text-xs text-gray-500 line-clamp-2">{description}</p>
        )}

        {hidePrivateDetails && (
          <p className="text-xs text-gray-500">Valuable item — verify to claim</p>
        )}

        {/* Action button */}
        <div className="flex justify-center mt-auto pt-2">
          {isClaimed ? (
            <div
              className="px-6 py-2 text-sm font-semibold text-center rounded-full border"
              style={{
                color: '#F5A623',
                backgroundColor: '#FEF3C7',
                borderColor: '#FEF3C7',
              }}
            >
              Claimed
            </div>
          ) : showRecoveredButton ? (
            <button
              onClick={handleRecoveredClick}
              disabled={claiming}
              className="px-5 py-2 text-sm font-semibold text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#F5A623' }}
            >
              {claiming ? 'Updating...' : 'I got this item back'}
            </button>
          ) : isOwnItem ? null : hasPendingClaim ? (
            <div
              className="px-6 py-2 text-sm font-semibold text-center rounded-full border"
              style={{
                color: '#F5A623',
                backgroundColor: '#FEF3C7',
                borderColor: '#FEF3C7',
              }}
            >
              Claim pending
            </div>
          ) : showClaim ? (
            <button
              onClick={handleClaimClick}
              disabled={claiming}
              className="px-6 py-2 text-sm font-semibold text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#F5A623' }}
            >
              {claiming ? 'Sending...' : 'Claim'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
