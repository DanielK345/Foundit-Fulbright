import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import ItemDetailPage from './pages/ItemDetailPage'
import PostItemPage from './pages/PostItemPage'
import ChatPage from './pages/ChatPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import ClaimVerificationPage from './pages/ClaimVerificationPage'
import EditItemPage from './pages/EditItemPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/*"
              element={
                <>
                  <Navbar />
                  <Routes>
                    <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                    <Route path="/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
                    <Route path="/post" element={<ProtectedRoute><PostItemPage /></ProtectedRoute>} />
                    <Route path="/post/found" element={<ProtectedRoute><PostItemPage /></ProtectedRoute>} />
                    <Route path="/post/lost" element={<ProtectedRoute><PostItemPage /></ProtectedRoute>} />
                    <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                    <Route path="/chat/:partnerId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                    <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    <Route path="/claim/:id" element={<ProtectedRoute><ClaimVerificationPage /></ProtectedRoute>} />
                    <Route path="/items/:id/edit" element={<ProtectedRoute><EditItemPage /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
