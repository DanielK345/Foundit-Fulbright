import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markRead } from '../api/notifications'
import { getLatestNotifications, timeAgo } from '../utils/notifications'
import LoadingSpinner from '../components/LoadingSpinner'
import { Bell, CheckCircle, MessageSquare } from 'lucide-react'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getNotifications()
      .then(res => setNotifications(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleClick = async (notif) => {
    if (notif.status === 'UNREAD') {
      try { await markRead(notif.id) } catch (_) {}
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, status: 'READ' } : n))
    }
    if (notif.chatSenderId) {
      navigate(`/chat/${notif.chatSenderId}${notif.relatedItemId ? `?itemId=${notif.relatedItemId}` : ''}`)
    } else if (notif.foundItemId && notif.lostItemId) {
      navigate(`/items/${notif.lostItemId}?verifyFoundItem=${notif.foundItemId}`)
    } else if (notif.relatedItemId) {
      navigate(`/items/${notif.relatedItemId}`)
    }
  }

  const displayed = getLatestNotifications(notifications)

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notifications</h1>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="xl" /></div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No notifications yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {displayed.map(notif => {
            const isUnread = notif.status === 'UNREAD'
            const isChat = !!notif.chatSenderId
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-colors hover:shadow-sm ${
                  isUnread ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isUnread ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  {isChat
                    ? <MessageSquare size={16} className={isUnread ? 'text-blue-600' : 'text-gray-400'} />
                    : isUnread
                      ? <Bell size={16} className="text-blue-600" />
                      : <CheckCircle size={16} className="text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${isUnread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {notif.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.timestamp)}</p>
                </div>
                {isUnread && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
