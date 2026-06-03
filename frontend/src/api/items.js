import api from './axios'

export const getItems = (params) => api.get('/items', { params })
export const getItem = (id) => api.get(`/items/${id}`)
export const reportFound = (data) => api.post('/items/found', data)
export const reportLost = (data) => api.post('/items/lost', data)
export const claimItem = (id) => api.post(`/items/${id}/claim`)
export const claimSimple = (id) => api.post(`/items/${id}/claim/simple`)
export const claimWithVerification = (id, data) => api.post(`/items/${id}/claim/verify`, data)
export const approveClaim = (id) => api.post(`/items/${id}/approve`)
export const markLostItemRecovered = (id) => api.post(`/items/${id}/recover`)
export const getMyItems = () => api.get('/items/my')
export const deleteItem = (id) => api.delete(`/items/${id}`)
export const updateItem = (id, data) => api.put(`/items/${id}`, data)

export const getItemClaimRequests = (id) =>
  api.get(`/items/${id}/claims`)

export const approveClaimRequest = (itemId, claimRequestId) =>
  api.post(`/items/${itemId}/claims/${claimRequestId}/approve`)

export const approveMatchClaim = (foundItemId, lostItemId) =>
  api.post(`/items/${foundItemId}/match/${lostItemId}/approve`)

export const uploadImage = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/upload', formData)
}
