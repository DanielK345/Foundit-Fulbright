import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'


import {
  getItem,
  claimSimple,
  approveClaim,
  markLostItemRecovered,
  getItemClaimRequests,
  approveClaimRequest,
  approveMatchClaim,
} from '../api/items'

const VALUABLE_KEYWORDS = [
  'phone', 'laptop', 'wallet', 'smartwatch', 'tablet', 'airpod',
  'ipad', 'macbook', 'iphone', 'samsung', 'watch', 'camera',
]

function isValuableItem(name) {
  if (!name) return false
  const lower = name.toLowerCase()
  return VALUABLE_KEYWORDS.some(k => lower.includes(k))
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const verifyFoundItemId = searchParams.get('verifyFoundItem')

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [error, setError] = useState('')
  // const [successMsg, setSuccessMsg] = useState('')

  const [claimRequests, setClaimRequests] = useState([])
  const [showClaimList, setShowClaimList] = useState(false)
  const [claimListMode, setClaimListMode] = useState(null)

  useEffect(() => {
    const fetchItem = async () => {
      try {
        setLoading(true)
        setError('')

        const data = await getItem(id)
        setItem(data.data || data)
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load item details.')
      } finally {
        setLoading(false)
      }
    }

    fetchItem()
  }, [id])

  const openClaimRequestList = async (mode) => {
  try {
    setActioning(true)
    setError('')

    const res = await getItemClaimRequests(id)
    const requests = res.data || res || []

    if (requests.length === 0) {
      setError('No claim requests found for this item.')
      return
    }

    if (requests.length === 1) {
      const onlyRequest = requests[0]

      if (mode === 'verify') {
        if (
          !window.confirm(
            `Approve ${onlyRequest.claimantName || 'this user'} as the owner of this item?`
          )
        ) {
          return
        }

        const approved = await approveClaimRequest(id, onlyRequest.id)
        setItem(approved.data || approved)
        setError('')
        setShowClaimList(false)
      }

      if (mode === 'chat') {
        navigate(`/chat/${onlyRequest.claimantId}?itemId=${id}`)
      }

      return
    }

    setClaimRequests(requests)
    setClaimListMode(mode)
    setShowClaimList(true)
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to load claim requests.')
  } finally {
    setActioning(false)
  }
}
  const handleSimpleClaim = async () => {
  if (!window.confirm('Send a claim request to the finder?')) return

  try {
    setActioning(true)
    setError('')

    const res = await claimSimple(id)

    setItem({
      ...(res.data || res),
      currentUserHasPendingClaim: true,
    })
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to send claim request.')
  } finally {
    setActioning(false)
  }
}

  const handleRecoveredClick = async () => {
    if (!window.confirm('Mark this lost item as claimed?')) return

    try {
      setUpdatingStatus(true)
      setError('')
      // setSuccessMsg('')

      const res = await markLostItemRecovered(id)
      setItem(res.data || res)
      // setSuccessMsg('You got this item back already.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update item status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleApproveClaim = async () => {
    if (!window.confirm('Approve this claim and mark item as claimed?')) return

    try {
      setActioning(true)
      setError('')
      // setSuccessMsg('')

      const res = await approveClaim(id)
      setItem(res.data || res)
      // setSuccessMsg('Item marked as claimed!')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve claim.')
    } finally {
      setActioning(false)
    }
  }

  const handleChat = () => {
    if (item?.reporterId) {
      navigate(`/chat/${item.reporterId}?itemId=${item.id}${item.isPublic === false ? '&anonymous=true' : ''}`)
    }
  }

  const handleFinderVerify = async () => {
  if (!window.confirm('Confirm this match and mark your found item as claimed?')) return

  try {
    setActioning(true)
    setError('')

    const res = await approveMatchClaim(verifyFoundItemId, id)

    setItem(res.data || res)
    setError('')

    navigate(`/items/${verifyFoundItemId}`)
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to verify match.')
  } finally {
    setActioning(false)
  }
}

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (error && !item) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:underline"
        >
          Back to home
        </button>
      </div>
    )
  }

  if (!item) return null

  const itemType = item.itemType?.toUpperCase()
  const isLost = itemType === 'LOST'
  const isFound = itemType === 'FOUND'

  const isOwner = user && String(user.id) === String(item.reporterId)
  const isClaimed = item.status === 'CLAIMED'
  const valuable = isValuableItem(item.name)

  const hasPendingClaim =
  item.currentUserHasPendingClaim && !isClaimed

  const hasAnyPendingClaims =
    isOwner && isFound && !isClaimed && item.pendingClaimCount > 0

  const showSimpleClaimBtn =
    !valuable &&
    isFound &&
    !isOwner &&
    !isClaimed &&
    !hasPendingClaim

  const userIsClaimant = user && String(user.id) === String(item.claimantId)

  const showVerifyClaimBtn =  valuable && isFound && !isOwner && !isClaimed && !hasPendingClaim

  const showVerifySubmitted =   valuable && isFound && !isOwner && !isClaimed && hasPendingClaim

  const hidePrivateDetails =
    valuable && isFound && !isOwner && !isClaimed

  const showRecoveredButton =
    isOwner && isLost && !isClaimed

  const lostItemRecovered =
    isLost && isClaimed

  const recoveredOwnerName =
    item.isPublic === false
      ? 'The owner'
      : item.reporterName || item.ownerName || 'The owner'

  const recoveredMessage =
    isOwner
      ? 'You got this item back already'
      : `${recoveredOwnerName} got this item back already`

  return (
    <div className="flex flex-col bg-gray-50">
      {/* Search + Filter bar */}
      <div className="py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-3">
          <div className="flex items-center flex-shrink-0 border border-gray-200 rounded-full bg-white overflow-hidden">
            {[
              { label: 'All Items', value: '' },
              { label: 'Lost Items', value: 'LOST' },
              { label: 'Found Items', value: 'FOUND' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => navigate(opt.value ? `/?type=${opt.value}` : '/')}
                className="px-4 py-3 rounded-full text-sm transition-colors text-gray-500 hover:text-brand-gold"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-2 border border-gray-200 rounded-full px-4 py-3 bg-white ml-auto"
            style={{ width: '720px' }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-gray-400 flex-shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>

            <input
              type="text"
              placeholder="Search for items"
              className="text-sm outline-none text-gray-500 placeholder-gray-400 w-full bg-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/?q=${e.target.value}`)
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 pt-8 pb-6">
        <div className="flex gap-10 items-start">
          {/* Left — image */}
          <div className="w-[38.5%] flex-shrink-0">
            {hidePrivateDetails ? (
              <div
                className="w-full bg-gray-100 rounded-2xl flex flex-col items-center justify-center"
                style={{ height: '380px' }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>

                <span className="text-gray-500 text-sm mt-3">
                  Image hidden for privacy
                </span>
              </div>
            ) : item.imageUrl ? (
              (() => {
                const urls = item.imageUrl.split('|').filter(Boolean)

                return (
                  <div
                    className="flex flex-col gap-3 overflow-y-auto"
                    style={{ height: '460px' }}
                  >
                    {urls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`${item.name} ${i + 1}`}
                        className="w-full object-contain bg-white rounded-2xl flex-shrink-0"
                        style={{ height: '460px' }}
                      />
                    ))}
                  </div>
                )
              })()
            ) : (
              <div
                className="w-full bg-gray-100 rounded-2xl flex items-center justify-center"
                style={{ height: '380px' }}
              >
                <span className="text-gray-500 text-sm">No image</span>
              </div>
            )}
          </div>

          {/* Right — details */}
          <div className="flex-1 flex flex-col pt-2">
            <h1 className="text-4xl font-bold mb-1 leading-tight text-gray-900">
              {item.name}
            </h1>

            <p className="text-xs text-gray-400 mb-2">
              Posted at{' '}
              {item.datePosted
                ? new Date(item.datePosted).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : ''}
              {' '}by{' '}
              {isOwner
                ? 'you'
                : item.isPublic === false
                  ? 'Anonymous Member'
                  : item.reporterName || 'Unknown'}
            </p>

            {item.dateEvent && (
              <p className="text-sm text-gray-500 mb-2">
                {isFound ? 'Date found' : 'Date lost'}:{' '}
                {new Date(item.dateEvent).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}

            {item.locationFound && (
              <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
                <MapPin size={14} className="text-brand-gold flex-shrink-0" />
                <span>{item.locationFound}</span>
              </div>
            )}

            {/* Description box */}
            {!hidePrivateDetails && (
              <div className="border border-gray-200 rounded-2xl p-4 mb-6 min-h-[200px]">
                <p className="text-sm text-gray-500 leading-relaxed">
                  {item.description || ''}
                </p>
              </div>
            )}

            {hidePrivateDetails && (
              <div className="border border-gray-200 rounded-2xl p-4 mb-6 min-h-[170px] flex items-center justify-center">
                <p className="text-sm text-gray-500 text-center leading-relaxed">
                  This is a valuable item. Description and image are hidden.
                  <br />
                  Submit a claim to verify ownership.
                </p>
              </div>
            )}

            {error && !isClaimed && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

            {/* {successMsg && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                {successMsg}
              </div>
            )} */}

            {/* Action buttons — below description */}
            {verifyFoundItemId && !isClaimed ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                  This lost item has a high chance to match your found item. Verify to confirm or chat to discuss.
                </div>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={handleFinderVerify}
                    disabled={actioning}
                    className="w-36 h-11 rounded-full text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#F5A623' }}
                  >
                    {actioning ? 'Verifying...' : 'Verify'}
                  </button>

                  <button
                    onClick={handleChat}
                    className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#03045E' }}
                  >
                    Chat
                  </button>
                </div>
              </div>
            ) : isClaimed ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                  {lostItemRecovered
                    ? recoveredMessage
                    : item.claimantName
                      ? `This item has been claimed by ${item.claimantName}`
                      : 'This item has been claimed'}
                </div>

                <div className="flex justify-center gap-4">
                  <div
                    className="w-36 h-11 rounded-full text-sm font-semibold flex items-center justify-center border cursor-not-allowed"
                    style={{
                      color: '#F5A623',
                      backgroundColor: '#FEF3C7',
                      borderColor: '#FEF3C7',
                    }}
                  >
                    {lostItemRecovered ? 'Claimed' : 'Claimed'}
                  </div>

                  {!isOwner && (
                    <button
                      onClick={handleChat}
                      className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#03045E' }}
                    >
                      Chat
                    </button>
                  )}
                </div>
              </div>
            ) : hasAnyPendingClaims ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                  {item.pendingClaimCount === 1
                    ? 'There is 1 claim request for this item. Verify to confirm or chat to discuss.'
                    : `There are ${item.pendingClaimCount} claim requests for this item. Choose a claimant to verify or chat.`}
                </div>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => openClaimRequestList('verify')}
                    disabled={actioning}
                    className="w-36 h-11 rounded-full text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#F5A623' }}
                  >
                    {actioning ? 'Loading...' : 'Verify'}
                  </button>

                  <button
                    onClick={() => openClaimRequestList('chat')}
                    className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#03045E' }}
                  >
                    Chat
                  </button>
                </div>
              </div>
            ) : isOwner ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                  This is your posted item
                </div>

                {showRecoveredButton && (
                  <div className="flex justify-center">
                  <button
                    onClick={handleRecoveredClick}
                    disabled={updatingStatus}
                    className="w-48 justify-center rounded-full items-center h-11 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: '#F5A623'}}
                  >
                    {updatingStatus ? 'Updating...' : 'I got this item back'}
                  </button>
                </div>
                )}
              </div>
            ) : showVerifySubmitted ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                  You submitted the claim verification
                </div>

                <div className="flex justify-center gap-4">
                  <div
                    className="w-36 h-11 rounded-full text-sm font-semibold flex items-center justify-center border cursor-not-allowed"
                    style={{
                      color: '#F5A623',
                      backgroundColor: '#FEF3C7',
                      borderColor: '#FEF3C7',
                    }}
                  >
                    Claim Pending
                  </div>

                  <button
                    onClick={handleChat}
                    className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#03045E' }}
                  >
                    Chat
                  </button>
                </div>
              </div>
            ) : showVerifyClaimBtn ? (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => navigate(`/claim/${id}`)}
                  className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#F5A623' }}
                >
                  Verify Claim
                </button>

                <button
                  onClick={handleChat}
                  className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#03045E' }}
                >
                  Chat
                </button>
              </div>
            ) : hasPendingClaim && !isOwner ? (
                <div className="flex flex-col gap-3">
                  <div className="p-3 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                    You submitted a claim request for this item
                  </div>

                  <div className="flex justify-center gap-4">
                    <div
                      className="w-36 h-11 rounded-full text-sm font-semibold flex items-center justify-center border cursor-not-allowed"
                      style={{
                        color: '#F5A623',
                        backgroundColor: '#FEF3C7',
                        borderColor: '#FEF3C7',
                      }}
                    >
                      Claim Pending
                    </div>

                    <button
                      onClick={handleChat}
                      className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#03045E' }}
                    >
                      Chat
                    </button>
                  </div>
                </div>
            ) : showSimpleClaimBtn ? (
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleSimpleClaim}
                  disabled={actioning}
                  className="w-36 h-11 rounded-full text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#F5A623' }}
                >
                  {actioning ? 'Sending...' : 'Claim'}
                </button>

                <button
                  onClick={handleChat}
                  className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#03045E' }}
                >
                  Chat
                </button>
              </div>
            ) : (
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleChat}
                  className="w-36 h-11 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#03045E' }}
                >
                  Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Claim request list modal */}
      {showClaimList && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {claimListMode === 'verify'
                ? 'Choose the correct claimant'
                : 'Choose a claimant to chat'}
            </h2>

            <div className="space-y-3">
              {claimRequests.map((request) => (
                <button
                  key={request.id}
                  onClick={async () => {
                    if (claimListMode === 'chat') {
                      navigate(`/chat/${request.claimantId}?itemId=${id}`)
                      return
                    }

                    if (
                      !window.confirm(
                        `Approve ${request.claimantName || 'this user'} as the owner of this item?`
                      )
                    ) {
                      return
                    }

                    try {
                      setActioning(true)

                      const res = await approveClaimRequest(id, request.id)
                      setItem(res.data || res)
                      setError('')
                      setShowClaimList(false)
                      // setSuccessMsg('Item marked as claimed.')
                    } catch (err) {
                      setError(err.response?.data?.message || 'Failed to approve claim.')
                    } finally {
                      setActioning(false)
                    }
                  }}
                  className="w-full p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left"
                >
                  <p className="font-semibold text-gray-900">
                    {request.claimantName || 'Unknown user'}
                  </p>

                  <p className="text-xs text-gray-500">
                    {request.claimantEmail}
                  </p>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowClaimList(false)}
              className="mt-5 w-full h-10 rounded-full bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>   
  )
}