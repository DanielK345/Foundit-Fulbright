import api from './axios'

export const getItems = (params) => api.get('/items', { params })
export const getItem = (id) => api.get(`/items/${id}`)
export const getMyItems = () => api.get('/items/my')
export const reportFound = (data) => api.post('/items/found', data)
export const reportLost = (data) => api.post('/items/lost', data)
export const updateItem = (id, data) => api.put(`/items/${id}`, data)
export const deleteItem = (id) => api.delete(`/items/${id}`)

export const claimSimple = (id) => api.post(`/items/${id}/claim/simple`)
export const claimWithVerification = (id, data) => api.post(`/items/${id}/claim/verify`, data)
export const getItemClaimRequests = (id) => api.get(`/items/${id}/claims`)
export const approveClaimRequest = (itemId, claimId) =>
  api.post(`/items/${itemId}/claims/${claimId}/approve`)
export const markLostItemRecovered = (id) => api.post(`/items/${id}/recover`)
export const approveMatchClaim = (foundId, lostId) =>
  api.post(`/items/${foundId}/match/${lostId}/approve`)

export const uploadImage = (formData) =>
  api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
