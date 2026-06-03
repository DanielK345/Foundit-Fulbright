import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, LogOut, User, ChevronDown, MessageCircle } from 'lucide-react'
import { Client } from '@stomp/stompjs'
import { useAuth } from '../context/AuthContext'
import { getNotifications, markRead } from '../api/notifications'
import { getLatestNotifications } from '../utils/notifications'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifFilter, setNotifFilter] = useState('all')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const notifRef = useRef(null)
  const userMenuRef = useRef(null)

  // Fetch notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    getNotifications()
      .then(res => setNotifications(res.data || []))
      .catch(() => {})
  }, [isAuthenticated])

  // Re-fetch when popup opens
  useEffect(() => {
    if (!notifOpen || !isAuthenticated) return
    getNotifications()
      .then(res => setNotifications(res.data || []))
      .catch(() => {})
  }, [notifOpen, isAuthenticated])

  // Poll every 15s to keep badge count up to date
  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(() => {
      getNotifications()
        .then(res => setNotifications(res.data || []))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // WebSocket — listen for real-time notifications
  useEffect(() => {
    if (!isAuthenticated) return
    const token = sessionStorage.getItem('token')
    if (!token) return

    const wsUrl = `ws://${window.location.host}/ws/websocket`
    const client = new Client({
      brokerURL: wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (frame) => {
          try {
            const notif = JSON.parse(frame.body)
            setNotifications(prev => [notif, ...prev])
          } catch { /* ignore */ }
        })
      },
    })
    client.activate()
    return () => client.deactivate()
  }, [isAuthenticated])

  // Close popups on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const latestNotifications = getLatestNotifications(notifications)
  const unreadCount = latestNotifications.filter(n => n.status === 'UNREAD').length
  const displayed = notifFilter === 'unread'
    ? latestNotifications.filter(n => n.status === 'UNREAD')
    : latestNotifications

  const handleNotifClick = async (n) => {
    if (n.status === 'UNREAD') {
      try {
        await markRead(n.id)
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, status: 'READ' } : x))
      } catch { /* ignore */ }
    }
    setNotifOpen(false)
    if (n.chatSenderId) {
      const chatUrl = n.relatedItemId
        ? `/chat/${n.chatSenderId}?itemId=${n.relatedItemId}`
        : `/chat/${n.chatSenderId}`
      navigate(chatUrl)
    } else if (n.relatedItemId) {
      // Match notification: if navigating to a lost item, pass the found item id so the finder can verify
      if (n.foundItemId && n.lostItemId && String(n.relatedItemId) === String(n.lostItemId)) {
        navigate(`/items/${n.relatedItemId}?verifyFoundItem=${n.foundItemId}`)
      } else {
        navigate(`/items/${n.relatedItemId}`)
      }
    } else if (n.lostItemId) {
      navigate(`/items/${n.lostItemId}`)
    } else if (n.foundItemId) {
      navigate(`/items/${n.foundItemId}`)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
    setUserMenuOpen(false)
  }

  return (
    <nav className="bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center">
            <span className="font-bold text-lg" style={{ color: '#03045E' }}>F</span>
          </div>
          <span className="font-bold text-base" style={{ color: '#03045E' }}>FoundIt Fulbright</span>
        </Link>

        {/* Right side — nav links + actions */}
        <div className="flex items-center gap-3">
          <NavLink to="/" end className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? 'text-brand-gold' : 'text-gray-700 hover:text-brand-gold'}`
          }>Home</NavLink>

          <NavLink to="/post/found" className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? 'text-brand-gold' : 'text-gray-700 hover:text-brand-gold'}`
          }>Report Found Item</NavLink>

          <NavLink to="/post/lost" className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? 'text-brand-gold' : 'text-gray-700 hover:text-brand-gold'}`
          }>Report Lost Item</NavLink>

          <NavLink to="/chat" className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? 'text-brand-gold' : 'text-gray-700 hover:text-brand-gold'}`
          }>Chat</NavLink>
          {isAuthenticated ? (
            <>
              {/* Notification bell + popup */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { setNotifOpen(o => !o); setUserMenuOpen(false) }}
                  className="relative p-1 text-gray-800 hover:text-brand-gold transition-colors"
                >
                  <Bell size={22} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification popup */}
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden" style={{ right: '-250px' }}>
                    {/* Header */}
                    <div className="px-4 pt-4 pb-2">
                      <h3 className="text-base font-bold text-gray-900">Notifications</h3>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 px-4 pb-2">
                      {['all', 'unread'].map(tab => (
                        <button
                          key={tab}
                          onClick={() => setNotifFilter(tab)}
                          className={`px-4 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                            notifFilter === tab
                              ? 'bg-gray-200 text-gray-900'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {tab === 'all' ? 'All' : 'Unread'}
                        </button>
                      ))}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-[550px] overflow-y-auto">
                      {displayed.length === 0 ? (
                        <div className="flex flex-col items-center py-8 text-center px-4">
                          <Bell size={28} className="text-gray-200 mb-2" />
                          <p className="text-sm text-gray-400">
                            {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                          </p>
                        </div>
                      ) : (
                        displayed.map(n => {
                          const isChat = !!n.chatSenderId
                          const displayName = isChat ? (n.chatSenderName || 'User') : 'FoundIt System'
                          const initial = displayName.charAt(0).toUpperCase()
                          return (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              n.status === 'UNREAD' ? 'bg-blue-50 hover:bg-blue-100' : ''
                            }`}
                          >
                            {/* Avatar */}
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 flex-shrink-0"
                              style={{ backgroundColor: isChat ? '#6B7280' : '#F5A623' }}
                            >
                              <span className="text-white text-xs font-bold">{initial}</span>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-800">{displayName}</p>
                              <p className="text-xs text-gray-500 line-clamp-3 mt-0.5">{n.message}</p>
                            </div>

                            {/* Time + unread dot */}
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className="text-[10px] text-gray-400">{timeAgo(n.timestamp)}</span>
                              {n.status === 'UNREAD' && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                              )}
                            </div>
                          </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User email + dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => { setUserMenuOpen(o => !o); setNotifOpen(false) }}
                  className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <span className="max-w-[200px] truncate">{user?.email}</span>
                  <ChevronDown size={14} className={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User size={15} />
                      My Profile
                    </Link>
                    <hr className="my-1 border-gray-100" />
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-brand-gold transition-colors">
                Login
              </Link>
              <Link to="/register" className="px-4 py-2 text-sm font-semibold text-white bg-brand-gold rounded-lg hover:bg-yellow-500 transition-colors">
                Register
              </Link>
            </div>
          )}
        </div>

      </div>
    </nav>
  )
}
