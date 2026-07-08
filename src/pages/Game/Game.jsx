import { Link, useParams } from 'react-router-dom'

/**
 * Placeholder de la pantalla de juego: se implementa completo en la
 * siguiente etapa (Canvas + STOMP sobre SockJS a /ws?token=).
 * Existe para que la navegacion desde la sala de espera no caiga
 * en el catch-all y rebote al lobby.
 */
export default function Game() {
  const { matchId } = useParams()

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Partida (en construcción)</h2>
        <p>
          Match: <code>{matchId}</code>
        </p>
        <p>La cancha con Canvas y WebSockets llega en la siguiente etapa.</p>
        <Link to="/">Volver al lobby</Link>
      </div>
    </div>
  )
}
