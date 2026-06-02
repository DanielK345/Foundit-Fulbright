import api from './axios'

export const getProfile = () => api.get('/users/me')
export const updateProfile = (data) => api.put('/users/me', data)
export const changePassword = (data) => api.post('/users/me/change-password', data)
export const getHistory = () => api.get('/users/me/history')
export const getUserById = (id) => api.get(`/users/${id}`)
