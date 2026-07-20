import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { playSfx } from '../services/soundService'

/**
 * Barra superior comun a todas las pantallas autenticadas:
 * logo, navegacion y datos de sesion con boton de salir.
 *
 * Entrar a una seccion suena a "avanzar" y volver al lobby a "retroceder":
 * el lobby es la raiz de la navegacion.
 */
export default function Header() {
  const { user, logout } = useAuth()

  const avanzar = () => playSfx('menuMas')
  const retroceder = () => playSfx('menuRetroceso')

  return (
    <header className="app-header">
      <Link to="/" className="logo header-logo" onClick={retroceder}>
        Puck<span>Zone</span>
      </Link>

      <nav className="header-nav">
        <NavLink to="/" end onClick={retroceder}>
          Lobby
        </NavLink>
        <NavLink to="/salas" onClick={avanzar}>Salas</NavLink>
        <NavLink to="/chat" onClick={avanzar}>Chat</NavLink>
        <NavLink to="/ranking" onClick={avanzar}>Ranking</NavLink>
        <NavLink to="/profile" onClick={avanzar}>Perfil</NavLink>
      </nav>

      <div className="header-user">
        <NavLink to="/settings" className="header-settings" onClick={avanzar}>
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
