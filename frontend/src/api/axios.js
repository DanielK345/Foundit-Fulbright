import axios from 'axios'

// In production set VITE_API_BASE_URL=https://your-backend.onrender.com
// In dev it falls back to '' so the Vite proxy handles /api
const api = axios.create({ baseURL: (import.meta.env.VITE_API_BASE_URL ?? '') + '/api' })

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && sessionStorage.getItem('token')) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
