import api from './axios'

export const getConversations = () => api.get('/conversations')
export const getConversation = (partnerId, itemId) =>
  api.get(`/messages/${partnerId}`, { params: itemId ? { itemId } : {} })
export const sendMessage = (recipientId, data) => api.post(`/messages/${recipientId}`, data)
