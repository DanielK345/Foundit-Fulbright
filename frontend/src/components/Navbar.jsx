import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Bell, User, LogOut, ChevronDown, Plus, Search } from 'lucide-react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuth } from '../context/AuthContext'
import { getUnreadCount, getNotifications, markRead } from '../api/notifications'
import { getLatestNotifications, timeAgo } from '../utils/notifications'

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('all')

  const notifRef = useRef(null)
  const userMenuRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!isAuthenticated) return
    try {
      const [countRes, notifsRes] = await Promise.all([getUnreadCount(), getNotifications()])
      setUnreadCount(countRes.data)
      setNotifications(notifsRes.data || [])
    } catch (_) {}
  }

  useEffect(() => {
    if (!isAuthenticated) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 15000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // WebSocket for real-time notifications
  useEffect(() => {
    if (!isAuthenticated) return
    const token = sessionStorage.getItem('token')
    if (!token) return

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (frame) => {
          try {
            const notif = JSON.parse(frame.body)
            setNotifications(prev => [notif, ...prev])
            setUnreadCount(c => c + 1)
          } catch (_) {}
        })
      },
      onStompError: () => {},
    })
    client.activate()
    return () => client.deactivate()
  }, [isAuthenticated])

  const handleNotifClick = async (notif) => {
    try { await markRead(notif.id) } catch (_) {}
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, status: 'READ' } : n))
    setUnreadCount(c => Math.max(0, c - (notif.status === 'UNREAD' ? 1 : 0)))
    setNotifOpen(false)

    if (notif.chatSenderId) {
      navigate(`/chat/${notif.chatSenderId}${notif.relatedItemId ? `?itemId=${notif.relatedItemId}` : ''}`)
    } else if (notif.foundItemId && notif.lostItemId) {
      navigate(`/items/${notif.lostItemId}?verifyFoundItem=${notif.foundItemId}`)
    } else if (notif.relatedItemId) {
      navigate(`/items/${notif.relatedItemId}`)
    }
  }

  const displayed = getLatestNotifications(notifications)
  const filtered = notifTab === 'unread' ? displayed.filter(n => n.status === 'UNREAD') : displayed

  const navLinkClass = ({ isActive }) =>
    `px-4 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? 'text-brand-gold' : 'text-gray-700 hover:text-brand-gold'}`

  return (
    <nav className="h-16 bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between gap-4">
        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-7 h-7 rounded-full bg-brand-gold flex items-center justify-center text-white font-bold text-sm" style={{ color: '#03045E' }}>
            F
          </span>
          <span className="font-bold text-brand-navy text-lg tracking-tight">FoundIt!</span>
        </button>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          <NavLink to="/chat" className={navLinkClass}>Messages</NavLink>
          <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
        </div>

        {/* Post buttons */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => navigate('/post/lost')}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
          >
            <Plus size={14} /> Lost
          </button>
          <button
            onClick={() => navigate('/post/found')}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-brand-gold text-white hover:bg-yellow-500 transition-colors"
          >
            <Plus size={14} /> Found
          </button>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(p => !p)}
              className="relative p-2 text-gray-600 hover:text-brand-gold hover:bg-gray-100 rounded-full transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
                    <button
                      onClick={() => { setNotifOpen(false); navigate('/notifications') }}
                      className="text-xs text-brand-gold hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {['all', 'unread'].map(tab => (
                      <button
                        key={tab}
                        onClick={() => setNotifTab(tab)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${notifTab === tab ? 'bg-brand-gold text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No notifications</p>
                  ) : (
                    filtered.slice(0, 20).map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${n.status === 'UNREAD' ? 'bg-blue-50' : ''}`}
                      >
                        <p className="text-xs text-gray-800 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.timestamp)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(p => !p)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand-gold flex items-center justify-center">
                  <User size={14} className="text-white" />
                </div>
              )}
              <span className="hidden sm:block text-sm text-gray-700 font-medium max-w-24 truncate">
                {user?.name?.split(' ')[0] || 'Me'}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/profile') }}
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User size={15} /> Profile
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); navigate('/login') }}
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
