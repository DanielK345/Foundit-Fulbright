import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getConversations, getConversation, sendMessage } from '../api/messages'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { Send, Search, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'

const AVATAR_COLORS = ['#6B7280', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B']

function avatarColor(userId) {
  return AVATAR_COLORS[(userId || 0) % AVATAR_COLORS.length]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function Avatar({ user }) {
  const color = avatarColor(user?.id)
  if (user?.profilePicture) {
    return <img src={user.profilePicture} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold" style={{ backgroundColor: color }}>
      {initials(user?.name)}
    </div>
  )
}

function timeDivider(prev, curr) {
  if (!prev) return true
  return (new Date(curr) - new Date(prev)) > 5 * 60 * 1000
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPage() {
  const { partnerId } = useParams()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get('itemId')
  const anonymous = searchParams.get('anonymous') === 'true'

  const { user } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([])
  const [convLoading, setConvLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')

  const messagesEndRef = useRef(null)
  const pollingRef = useRef(null)

  // Load conversations
  useEffect(() => {
    getConversations()
      .then(res => setConversations(res.data || []))
      .catch(() => {})
      .finally(() => setConvLoading(false))
  }, [])

  // Load messages when partnerId changes
  useEffect(() => {
    if (!partnerId) return
    setMsgLoading(true)
    getConversation(partnerId, itemId)
      .then(res => setMessages(res.data || []))
      .catch(() => {})
      .finally(() => setMsgLoading(false))

    // 3s polling
    pollingRef.current = setInterval(() => {
      getConversation(partnerId, itemId)
        .then(res => setMessages(res.data || []))
        .catch(() => {})
    }, 3000)

    return () => clearInterval(pollingRef.current)
  }, [partnerId, itemId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!draft.trim() || !partnerId) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    try {
      const res = await sendMessage({ receiverId: parseInt(partnerId), content: text, itemId: itemId ? parseInt(itemId) : null })
      setMessages(prev => [...prev, res.data])
    } catch (err) {
      toast.error('Failed to send message')
      setDraft(text) // restore
    } finally {
      setSending(false)
    }
  }

  const filteredConvs = conversations.filter(c => {
    if (tab === 'unread' && !c.unread) return false
    if (search) return c.partnerName?.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const activePartner = conversations.find(c => String(c.partnerId) === String(partnerId))

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-4rem)] flex">
      {/* Left: conversation list */}
      <div className={`w-full sm:w-80 border-r border-gray-200 flex flex-col bg-white ${partnerId ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">Messages</h2>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:border-brand-gold"
              placeholder="Search conversations…"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'unread'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${tab === t ? 'bg-brand-gold text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : filteredConvs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filteredConvs.map(conv => (
              <button
                key={conv.partnerId}
                onClick={() => navigate(`/chat/${conv.partnerId}${itemId ? `?itemId=${itemId}` : ''}`)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 ${String(conv.partnerId) === String(partnerId) ? 'bg-yellow-50' : ''}`}
              >
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-semibold"
                  style={{ backgroundColor: avatarColor(conv.partnerId) }}>
                  {initials(conv.partnerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium truncate ${conv.unread ? 'text-gray-900' : 'text-gray-700'}`}>
                      {conv.partnerName || 'Anonymous'}
                    </span>
                    {conv.lastTimestamp && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTime(conv.lastTimestamp)}</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${conv.unread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {conv.lastMessage || 'No messages yet'}
                  </p>
                </div>
                {conv.unread && <div className="w-2 h-2 rounded-full bg-brand-gold flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: message thread */}
      <div className={`flex-1 flex flex-col bg-gray-50 ${partnerId ? 'flex' : 'hidden sm:flex'}`}>
        {!partnerId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare size={48} className="mb-3 opacity-30" />
            <p className="font-medium">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
              <button onClick={() => navigate('/chat')} className="sm:hidden p-1 text-gray-500">←</button>
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: avatarColor(parseInt(partnerId)) }}>
                {initials(activePartner?.partnerName || '?')}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{activePartner?.partnerName || (anonymous ? 'Anonymous' : 'User')}</p>
                {itemId && <p className="text-xs text-gray-400">re: item #{itemId}</p>}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
              {msgLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Start the conversation</div>
              ) : (
                messages.map((msg, i) => {
                  const isMine = String(msg.senderId) === String(user?.id)
                  const prevMsg = messages[i - 1]
                  const showDivider = timeDivider(prevMsg?.timestamp, msg.timestamp)

                  return (
                    <div key={msg.id || i}>
                      {showDivider && (
                        <div className="text-center text-[10px] text-gray-400 my-3">
                          {formatTime(msg.timestamp)}
                        </div>
                      )}
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5`}>
                        <div className={`max-w-[65%] px-4 py-2 rounded-2xl text-sm ${
                          isMine ? 'chat-bubble-sent rounded-br-sm' : 'chat-bubble-received rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-brand-gold"
              />
              <button type="submit" disabled={!draft.trim() || sending}
                className="w-9 h-9 rounded-full bg-brand-gold text-white flex items-center justify-center hover:bg-yellow-500 transition-colors disabled:opacity-40">
                {sending ? <LoadingSpinner size="sm" color="white" /> : <Send size={15} />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
