import { useEffect, useState } from 'react'
import Header from '../../components/Header'
import { useAuth } from '../../hooks/useAuth'
import { getPlayer } from '../../services/rankingService'

/**
 * Perfil del usuario: datos de la cuenta (de la sesión/JWT) y estadísticas
 * competitivas de ranking. Solo lectura: no hay backend de edición.
 * Sin partidas todavía → ranking devuelve 404 y se muestran los valores
 * iniciales (ELO 1200), igual que en el lobby.
 */
export default function Profile() {
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPlayer(user.userId)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.userId])

  const games = stats ? stats.wins + stats.losses : 0
  const winrate = games > 0 ? Math.round((stats.wins / games) * 100) : null

  return (
    <div className="app-page">
      <Header />

      <main className="profile-main">
        <section className="profile-card">
          <h1>{user.username}</h1>
          <p className="player-university">{user.university}</p>

          <dl className="profile-data">
            <div>
              <dt>Correo</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Universidad</dt>
              <dd>{user.university}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-card">
          <h2>Estadísticas</h2>
          {loading ? (
            <p className="ranking-empty">Cargando…</p>
          ) : (
            <>
              <div className="player-stats">
                <div>
                  <span className="stat-value">{stats?.elo ?? 1200}</span>
                  <span className="stat-label">ELO</span>
                </div>
                <div>
                  <span className="stat-value">{stats ? `#${stats.position}` : '—'}</span>
                  <span className="stat-label">Posición</span>
                </div>
                <div>
                  <span className="stat-value">
                    {stats ? `${stats.wins} - ${stats.losses}` : '0 - 0'}
                  </span>
                  <span className="stat-label">V - D</span>
                </div>
                <div>
                  <span className="stat-value">{winrate !== null ? `${winrate}%` : '—'}</span>
                  <span className="stat-label">Victorias</span>
                </div>
              </div>
              {!stats && (
                <p className="profile-hint">
                  Aún no tienes partidas registradas: estos son los valores iniciales.
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
