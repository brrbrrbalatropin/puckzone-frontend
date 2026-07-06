import { useNavigate } from 'react-router-dom'
import { leaveQueue } from '../../services/matchmakingService'

/**
 * Placeholder de la sala de espera: se implementa completo en la
 * siguiente etapa (polling de /queue/status hasta MATCHED).
 * Por ahora solo permite cancelar y volver al lobby.
 */
export default function Waiting() {
  const navigate = useNavigate()

  const handleCancel = async () => {
    try {
      await leaveQueue()
    } finally {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Sala de espera (en construcción)</h2>
        <p>Buscando rival…</p>
        <button type="button" onClick={handleCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
