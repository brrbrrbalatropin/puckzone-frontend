import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import Lobby from './pages/Lobby/Lobby'
import Waiting from './pages/Waiting/Waiting'
import Game from './pages/Game/Game'
import Ranking from './pages/Ranking/Ranking'
import Profile from './pages/Profile/Profile'
import Settings from './pages/Settings/Settings'
import Rooms from './pages/Rooms/Rooms'
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
      <Route
        path="/waiting"
        element={
          <ProtectedRoute>
            <Waiting />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:matchId"
        element={
          <ProtectedRoute>
            <Game />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ranking"
        element={
          <ProtectedRoute>
            <Ranking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/salas"
        element={
          <ProtectedRoute>
            <Rooms />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
