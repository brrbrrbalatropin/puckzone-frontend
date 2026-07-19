import { useEffect, useState } from 'react'
import Header from '../../components/Header'
import { useAuth } from '../../hooks/useAuth'
import { getPlayer, getPlayerMatches } from '../../services/rankingService'

/**
 * Perfil del usuario: datos de la cuenta (de la sesión/JWT), estadísticas
 * competitivas y el historial de partidas. Solo lectura.
 * Las partidas vs bot aparecen en el historial con "+0 · vs IA": no mueven
 * ELO ni cuentan en V-D. Sin partidas → ranking devuelve 404 y se muestran
 * los valores iniciales (ELO 1200); la posición es null si solo ha jugado
 * contra el bot (no está rankeado).
 */
export default function Profile() {
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([getPlayer(user.userId), getPlayerMatches(user.userId)])
      .then(([statsResult, matchesResult]) => {
        if (cancelled) return
        // 404 = sin partidas humanas todavía; se muestran valores iniciales
        setStats(statsResult.status === 'fulfilled' ? statsResult.value : null)
        setMatches(matchesResult.status === 'fulfilled' ? matchesResult.value : [])
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
                  <span className="stat-value">
                    {stats?.position != null ? `#${stats.position}` : '—'}
                  </span>
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
              <p className="profile-hint">
                Las estadísticas solo cuentan partidas contra humanos; contra la
                IA se juega sin apuesta de ELO.
              </p>
            </>
          )}
        </section>

        <section className="profile-card">
          <h2>Historial</h2>
          {loading && <p className="ranking-empty">Cargando…</p>}
          {!loading && matches.length === 0 && (
            <p className="ranking-empty">Aún no has jugado partidas.</p>
          )}
          {!loading && matches.length > 0 && (
            <ul className="match-history">
              {matches.map((m) => (
                <li key={m.matchId} className={m.won ? 'won' : 'lost'}>
                  <span className="match-result">{m.won ? 'Victoria' : 'Derrota'}</span>
                  <span className="match-rival">
                    vs {m.vsBot ? 'IA' : m.opponentUsername}
                  </span>
                  <span className="match-score">
                    {m.myScore} - {m.rivalScore}
                  </span>
                  <span className={`match-elo ${eloClass(m)}`}>{eloLabel(m)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

/** Color del delta ELO: neutro sin apuesta (bot/amistosa), verde/rojo si movió. */
function eloClass(m) {
  if (m.vsBot || m.friendly) return 'neutral'
  return m.won ? 'gain' : 'loss'
}

function eloLabel(m) {
  if (m.vsBot) return '+0 · vs IA'
  if (m.friendly) return '+0 · amistosa'
  return `${m.eloChange > 0 ? '+' : ''}${m.eloChange}`
}
