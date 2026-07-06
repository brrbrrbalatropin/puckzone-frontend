import { useAuth } from '../../hooks/useAuth'

/**
 * Placeholder del lobby: se implementa completo en la siguiente etapa.
 * Por ahora solo confirma que la sesion funciona y permite cerrarla.
 */
export default function Lobby() {
  const { user, logout } = useAuth()

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="logo">
          Puck<span>Zone</span>
        </h1>
        <h2>Lobby (en construcción)</h2>
        <p>
          Hola, <strong>{user?.username}</strong> ({user?.university})
        </p>
        <button type="button" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
