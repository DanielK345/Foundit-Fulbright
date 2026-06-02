import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getItem, deleteItem, claimSimple, markLostItemRecovered, getItemClaimRequests, approveClaimRequest, approveMatchClaim } from '../api/items'
import { getItems as getAllItems } from '../api/items'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import { MapPin, Calendar, Tag, MessageSquare, Edit2, Trash2, ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

const VALUABLE_KEYWORDS = ['phone', 'laptop', 'wallet', 'smartwatch', 'tablet',
  'airpod', 'ipad', 'macbook', 'iphone', 'samsung', 'watch', 'camera']

function isValuable(name = '') {
  return VALUABLE_KEYWORDS.some(k => name.toLowerCase().includes(k))
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const verifyFoundItemId = searchParams.get('verifyFoundItem')
  const { user } = useAuth()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [claims, setClaims] = useState([])
  const [showClaims, setShowClaims] = useState(false)
  const [matches, setMatches] = useState([])
  const [imgIdx, setImgIdx] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getItem(id)
      .then(res => setItem(res.data))
      .catch(() => toast.error('Item not found'))
      .finally(() => setLoading(false))
  }, [id])

  const isOwner = user && item && item.reporterEmail === user.email
  const valuable = isValuable(item?.name || '')
  const images = item?.imageUrl ? item.imageUrl.split('|').filter(Boolean) : []

  const handleClaim = async () => {
    if (valuable) { navigate(`/claim/${id}`); return }
    setActionLoading(true)
    try {
      const res = await claimSimple(id)
      setItem(res.data)
      toast.success('Claim request submitted!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit claim')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRecover = async () => {
    setActionLoading(true)
    try {
      const res = await markLostItemRecovered(id)
      setItem(res.data)
      toast.success('Marked as self-recovered!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try {
      await deleteItem(id)
      toast.success('Item deleted')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete this item')
    }
  }

  const loadClaims = async () => {
    try {
      const res = await getItemClaimRequests(id)
      setClaims(res.data || [])
    } catch (_) {}
  }

  const handleViewClaims = async () => {
    await loadClaims()
    setShowClaims(true)
  }

  const handleApproveClaim = async (claimId) => {
    setActionLoading(true)
    try {
      const res = await approveClaimRequest(id, claimId)
      setItem(res.data)
      setShowClaims(false)
      toast.success('Claim approved!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveMatch = async () => {
    setActionLoading(true)
    try {
      const res = await approveMatchClaim(id, verifyFoundItemId)
      setItem(res.data)
      toast.success('Match approved!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center py-24"><LoadingSpinner size="xl" /></div>
  if (!item) return <div className="text-center py-24 text-gray-400">Item not found</div>

  const hideImage = valuable && !isOwner && item.status !== 'CLAIMED'

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Image gallery */}
        {images.length > 0 && (
          <div className="relative bg-gray-100">
            {hideImage ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
                <EyeOff size={32} />
                <p className="text-sm font-medium">Image hidden for privacy</p>
                <p className="text-xs">Verify ownership to view</p>
              </div>
            ) : (
              <>
                <img src={images[imgIdx]} alt={item.name} className="w-full h-64 object-contain" />
                {images.length > 1 && (
                  <div className="flex gap-1.5 justify-center py-2">
                    {images.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === imgIdx ? 'bg-brand-gold' : 'bg-gray-300'}`} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Info */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">{item.name}</h1>
              <StatusBadge status={item.status} />
            </div>
            {isOwner && item.status !== 'CLAIMED' && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => navigate(`/items/${id}/edit`)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                  <Edit2 size={16} />
                </button>
                <button onClick={handleDelete}
                  className="p-2 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          {item.description && (
            <p className="text-gray-700 text-sm mb-4 leading-relaxed">{item.description}</p>
          )}

          <div className="flex flex-col gap-2 text-sm text-gray-600 mb-6">
            {item.locationFound && (
              <span className="flex items-center gap-2"><MapPin size={15} className="text-brand-gold" />{item.locationFound}</span>
            )}
            {item.category && (
              <span className="flex items-center gap-2"><Tag size={15} className="text-brand-gold" />{item.category}</span>
            )}
            {item.dateEvent && (
              <span className="flex items-center gap-2"><Calendar size={15} className="text-brand-gold" />Date: {item.dateEvent}</span>
            )}
            <span className="flex items-center gap-2">
              {item.isPublic !== false ? <Eye size={15} className="text-brand-gold" /> : <EyeOff size={15} className="text-brand-gold" />}
              Posted by {item.reporterName || 'Anonymous Member'}
              {item.reporterEmail && item.isPublic !== false && ` · ${item.reporterEmail}`}
            </span>
          </div>

          {/* Match approval banner */}
          {verifyFoundItemId && isOwner && item.status === 'LOST' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-blue-800 font-medium mb-2">A potential match was found for this item!</p>
              <button onClick={handleApproveMatch} disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50">
                {actionLoading ? 'Approving…' : 'Approve Match & Mark Recovered'}
              </button>
            </div>
          )}

          {/* Claimed info */}
          {item.status === 'CLAIMED' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-green-800 font-medium">✓ This item has been claimed and returned to its owner.</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {/* Owner: found item with pending claims */}
            {isOwner && item.itemType === 'FOUND' && item.pendingClaimCount > 0 && item.status !== 'CLAIMED' && (
              <button onClick={handleViewClaims}
                className="px-4 py-2 rounded-full bg-brand-gold text-white text-sm font-medium hover:bg-yellow-500 transition-colors">
                View {item.pendingClaimCount} Claim Request{item.pendingClaimCount !== 1 ? 's' : ''}
              </button>
            )}

            {/* Owner: lost item — self recover */}
            {isOwner && item.itemType === 'LOST' && item.status === 'LOST' && !verifyFoundItemId && (
              <button onClick={handleRecover} disabled={actionLoading}
                className="px-4 py-2 rounded-full border border-brand-gold text-brand-gold text-sm font-medium hover:bg-orange-50 transition-colors disabled:opacity-50">
                {actionLoading ? 'Updating…' : 'Mark as Self-Recovered'}
              </button>
            )}

            {/* Non-owner: claim a found item */}
            {!isOwner && item.status === 'FOUND' && (
              item.currentUserHasPendingClaim ? (
                <span className="px-4 py-2 rounded-full border border-gray-200 text-gray-400 text-sm">Claim Request Pending</span>
              ) : (
                <button onClick={handleClaim} disabled={actionLoading}
                  className="px-4 py-2 rounded-full bg-brand-gold text-white text-sm font-medium hover:bg-yellow-500 transition-colors disabled:opacity-50">
                  {actionLoading ? 'Processing…' : valuable ? 'Verify Ownership' : 'Claim This Item'}
                </button>
              )
            )}

            {/* Chat with reporter */}
            {!isOwner && item.reporterEmail && item.status !== 'CLAIMED' && (
              <button
                onClick={() => navigate(`/chat/${item.reporterId}?itemId=${item.id}${item.isPublic === false ? '&anonymous=true' : ''}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-gray-600 text-sm font-medium hover:border-brand-gold hover:text-brand-gold transition-colors"
              >
                <MessageSquare size={15} /> Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Claim requests modal */}
      {showClaims && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowClaims(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-4">Pending Claim Requests</h3>
            {claims.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No pending claims</p>
            ) : (
              <div className="flex flex-col gap-3">
                {claims.map(claim => (
                  <div key={claim.id} className="border border-gray-100 rounded-xl p-3">
                    <p className="font-medium text-sm text-gray-900">{claim.claimantName}</p>
                    <p className="text-xs text-gray-500 mb-1">{claim.claimantEmail}</p>
                    {claim.verificationDetails && (
                      <p className="text-xs text-gray-600 mb-2 italic">"{claim.verificationDetails}"</p>
                    )}
                    <button
                      onClick={() => handleApproveClaim(claim.id)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-full hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowClaims(false)} className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-800">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
