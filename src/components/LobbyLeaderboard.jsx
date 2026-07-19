import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getGlobalRanking } from '../services/rankingService'

const TOP_SIZE = 8

/**
 * Vistazo rápido del leaderboard global en el lobby: top de jugadores con
 * nombre y ELO, resaltando al usuario si aparece. La tabla completa (con
 * universidades y pestañas) sigue viviendo en /ranking.
 */
export default function LobbyLeaderboard() {
  const { user } = useAuth()
  const [players, setPlayers] = useState(null)

  useEffect(() => {
    let cancelled = false
    getGlobalRanking(TOP_SIZE)
      .then((data) => {
        if (!cancelled) setPlayers(data)
      })
      .catch(() => {
        if (!cancelled) setPlayers([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="lobby-leaderboard">
      <h3>Leaderboard</h3>

      {players === null && <p className="leaderboard-empty">Cargando…</p>}
      {players?.length === 0 && (
        <p className="leaderboard-empty">Aún no hay partidas rankeadas.</p>
      )}
      {players?.length > 0 && (
        <ol className="leaderboard-list">
          {players.map((p) => (
            <li key={p.id} className={p.id === user.userId ? 'me' : ''}>
              <span className="leaderboard-pos">#{p.position}</span>
              <span className="leaderboard-name" title={`${p.username} (${p.university})`}>
                {p.username}
              </span>
              <span className="leaderboard-elo">{p.elo}</span>
            </li>
          ))}
        </ol>
      )}

      <Link to="/ranking" className="leaderboard-more">
        Ver ranking completo →
      </Link>
    </section>
  )
}
