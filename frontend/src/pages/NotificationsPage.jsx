import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle } from 'lucide-react'
import { getNotifications, markRead } from '../api/notifications'
import LoadingSpinner from '../components/LoadingSpinner'
import { getLatestNotifications } from '../utils/notifications'

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await getNotifications()
        setNotifications(res.data || res)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchNotifications()
  }, [])

  const handleMarkRead = async (id) => {
    try {
      await markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'READ' } : n))
      )
    } catch {
      // ignore
    }
  }

  const handleNotificationClick = async (n) => {
    if (n.status === 'UNREAD') {
      await handleMarkRead(n.id)
    }
    if (n.chatSenderId) {
      const chatUrl = n.relatedItemId
        ? `/chat/${n.chatSenderId}?itemId=${n.relatedItemId}`
        : `/chat/${n.chatSenderId}`
      navigate(chatUrl)
    }
    else if (n.lostItemId) navigate(`/items/${n.lostItemId}`)
    else if (n.foundItemId) navigate(`/items/${n.foundItemId}`)
  }

  const latestNotifications = getLatestNotifications(notifications)
  const displayed = filter === 'unread'
    ? latestNotifications.filter((n) => n.status === 'UNREAD')
    : latestNotifications

  const unreadCount = latestNotifications.filter((n) => n.status === 'UNREAD').length

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {['all', 'unread'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Bell size={40} className="text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            You'll be notified when a potential match is found for your item.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-colors border ${
                n.status === 'UNREAD'
                  ? 'bg-blue-50 border-blue-100 hover:bg-blue-100'
                  : 'bg-white border-gray-100 hover:bg-gray-50'
              }`}
            >
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                n.status === 'UNREAD' ? 'bg-blue-600' : 'bg-gray-200'
              }`}>
                {n.status === 'READ' ? (
                  <CheckCircle size={16} className="text-gray-500" />
                ) : (
                  <Bell size={16} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.status === 'UNREAD' ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {n.message}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(n.timestamp)}</p>
              </div>
              {n.status === 'UNREAD' && (
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
