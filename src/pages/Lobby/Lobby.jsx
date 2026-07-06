import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import { useAuth } from '../../hooks/useAuth'
import { joinQueue } from '../../services/matchmakingService'
import { getPlayer } from '../../services/rankingService'

/**
 * Pantalla principal tras el login. Muestra las estadisticas del jugador
 * (ELO, W/L, posicion global) y el boton para buscar partida, que lo mete
 * a la cola de matchmaking y lo lleva a la sala de espera.
 */
export default function Lobby() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPlayer(user.userId)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        // 404 = jugador sin partidas todavia; se muestran valores iniciales
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.userId])

  const handlePlay = async () => {
    setError('')
    setSearching(true)
    try {
      await joinQueue()
      navigate('/waiting')
    } catch (err) {
      if (err.response?.status === 409) {
        // Ya estaba en cola: seguimos a la sala de espera
        navigate('/waiting')
      } else {
        setError(err.response?.data?.message || 'No se pudo entrar a la cola.')
        setSearching(false)
      }
    }
  }

  return (
    <div className="app-page">
      <Header />

      <main className="lobby-main">
        <section className="player-card">
          <h2>{user.username}</h2>
          <p className="player-university">{user.university}</p>

          {statsLoading ? (
            <p>Cargando estadísticas…</p>
          ) : stats ? (
            <div className="player-stats">
              <div>
                <span className="stat-value">{stats.elo}</span>
                <span className="stat-label">ELO</span>
              </div>
              <div>
                <span className="stat-value">#{stats.position}</span>
                <span className="stat-label">Global</span>
              </div>
              <div>
                <span className="stat-value">{stats.wins}</span>
                <span className="stat-label">Victorias</span>
              </div>
              <div>
                <span className="stat-value">{stats.losses}</span>
                <span className="stat-label">Derrotas</span>
              </div>
            </div>
          ) : (
            <p className="player-no-stats">
              Aún no tienes partidas. ELO inicial: <strong>1200</strong>
            </p>
          )}
        </section>

        <section className="play-section">
          <button
            type="button"
            className="play-button"
            onClick={handlePlay}
            disabled={searching}
          >
            {searching ? 'Entrando a la cola…' : 'Buscar partida'}
          </button>
          <p className="play-hint">
            Se busca rival de tu nivel; si en 10 segundos no aparece, juegas
            contra un bot.
          </p>
          {error && <p className="form-error">{error}</p>}
        </section>
      </main>
    </div>
  )
}
