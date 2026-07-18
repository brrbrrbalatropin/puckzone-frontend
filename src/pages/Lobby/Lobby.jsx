import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import LobbyChat from '../../components/LobbyChat'
import LobbyLeaderboard from '../../components/LobbyLeaderboard'
import { useAuth } from '../../hooks/useAuth'
import { getActiveGame } from '../../services/gameService'
import { joinQueue, playBot } from '../../services/matchmakingService'
import { getPlayer } from '../../services/rankingService'
import { playSfx } from '../../services/soundService'

/**
 * Pantalla principal tras el login, a tres columnas: vistazo del
 * leaderboard, tarjeta del jugador con el boton de buscar partida, y chat
 * global. Si el jugador tiene una partida viva (cerro la pestana a mitad
 * de juego), se le ofrece volver antes de que la ventana de gracia lo de
 * por abandonado. En pantallas angostas las columnas se apilan.
 */
export default function Lobby() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [activeGame, setActiveGame] = useState(null)

  useEffect(() => {
    let cancelled = false
    getActiveGame()
      .then((game) => {
        if (!cancelled) setActiveGame(game)
      })
      .catch(() => {
        // Sin oferta de reconexion si falla; no bloquea el lobby.
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    playSfx('seleccionar')
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

  // Directo contra el bot, sin sala de espera: entra a la cola (409 = ya
  // estaba, da igual) y acepta el bot de inmediato. Si justo en ese instante
  // lo emparejó un humano, matchmaking devuelve esa sala y también sirve.
  const handlePlayBotNow = async () => {
    playSfx('seleccionar')
    setError('')
    setSearching(true)
    try {
      try {
        await joinQueue()
      } catch (err) {
        if (err.response?.status !== 409) throw err
      }
      const status = await playBot()
      navigate(`/game/${status.match.matchId}?shard=${status.match.shard ?? 0}`)
    } catch {
      // Carrera rara (p. ej. emparejado y la sala aún no está lista):
      // la sala de espera la resuelve con su polling.
      navigate('/waiting')
    }
  }

  return (
    <div className="app-page">
      <Header />

      <main className="lobby-main">
        <LobbyLeaderboard />

        <div className="lobby-center">
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

          {activeGame && (
            <section className="reconnect-card">
              <h3>Tienes una partida en curso</h3>
              <p>
                Contra{' '}
                <strong>
                  {activeGame.opponentType === 'BOT'
                    ? 'el BOT'
                    : activeGame.opponentUsername}
                </strong>
                , vas {activeGame.myScore} — {activeGame.opponentScore}. Si no
                vuelves, perderás por abandono.
              </p>
              <div className="reconnect-actions">
                <button
                  type="button"
                  onClick={() => navigate(`/game/${activeGame.gameId}?shard=${activeGame.shard ?? 0}`)}
                >
                  Volver a la partida
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setActiveGame(null)}
                >
                  Ignorar
                </button>
              </div>
            </section>
          )}

          <section className="play-section">
            <button
              type="button"
              className="play-button"
              onClick={handlePlay}
              disabled={searching}
            >
              {searching ? 'Entrando a la cola…' : 'Buscar partida'}
            </button>
            <button
              type="button"
              className="bot-button"
              onClick={handlePlayBotNow}
              disabled={searching}
            >
              Jugar contra el bot
            </button>
            <p className="play-hint">
              Se busca rival de tu nivel; si en 10 segundos no aparece, puedes
              jugar contra el bot. O entra directo contra el bot (no afecta tu
              ELO).
            </p>
            {error && <p className="form-error">{error}</p>}
          </section>
        </div>

        <LobbyChat />
      </main>
    </div>
  )
}
