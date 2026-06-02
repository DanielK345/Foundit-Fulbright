import api from './axios'

export const getNotifications = () => api.get('/notifications')
export const markRead = (id) => api.put(`/notifications/${id}/read`)
export const getUnreadCount = () => api.get('/notifications/unread-count')
