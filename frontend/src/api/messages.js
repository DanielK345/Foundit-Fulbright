import api from './axios'

export const getConversations = () => api.get('/conversations')
export const getConversation = (partnerId, itemId = null) => api.get(`/messages/${partnerId}`, { params: itemId ? { itemId } : {} })
export const sendMessage = (recipientId, content, itemId = null) => api.post(`/messages/${recipientId}`, { content, itemId })
