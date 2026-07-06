import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import Lobby from './pages/Lobby/Lobby'
import { useAuth } from './hooks/useAuth'

/**
 * Enrutamiento principal. /login y /register son publicas (si ya hay sesion
 * redirigen al lobby); el resto exige autenticacion via ProtectedRoute.
 * Las pantallas de waiting/game/ranking/profile se agregan por etapas.
 */
function PublicOnly({ children }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return children
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
