import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Barra superior comun a todas las pantallas autenticadas:
 * logo, navegacion y datos de sesion con boton de salir.
 */
export default function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="app-header">
      <Link to="/" className="logo header-logo">
        Puck<span>Zone</span>
      </Link>

      <nav className="header-nav">
        <NavLink to="/" end>
          Lobby
        </NavLink>
        <NavLink to="/salas">Salas</NavLink>
        <NavLink to="/ranking">Ranking</NavLink>
        <NavLink to="/profile">Perfil</NavLink>
      </nav>

      <div className="header-user">
        <NavLink to="/settings" className="header-settings">
          Ajustes
        </NavLink>
        <span>
          {user?.username} <small>({user?.university})</small>
        </span>
        <button type="button" onClick={logout}>
          Salir
        </button>
      </div>
    </header>
  )
}
