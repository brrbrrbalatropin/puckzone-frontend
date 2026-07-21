import { useEffect, useState } from 'react'
import Header from '../../components/Header'
import { useAuth } from '../../hooks/useAuth'
import { getGlobalRanking, getUniversityRanking } from '../../services/rankingService'

/**
 * Leaderboards en dos pestañas: jugadores (top global por ELO) y
 * universidades (suma del ELO de sus estudiantes). La fila del usuario
 * y la de su universidad se resaltan.
 */
export default function Ranking() {
  const { user } = useAuth()

  const [tab, setTab] = useState('players')
  const [players, setPlayers] = useState(null)
  const [universities, setUniversities] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([getGlobalRanking(50), getUniversityRanking()])
      .then(([p, u]) => {
        if (cancelled) return
        setPlayers(p)
        setUniversities(u)
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el ranking. Intenta de nuevo.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = !error && (players === null || universities === null)

  return (
    <div className="app-page">
      <Header />

      <main className="ranking-main">
        <h1>Ranking</h1>

        <div className="ranking-tabs">
          <button
            type="button"
            className={tab === 'players' ? 'active' : ''}
            onClick={() => setTab('players')}
          >
            Jugadores
          </button>
          <button
            type="button"
            className={tab === 'universities' ? 'active' : ''}
            onClick={() => setTab('universities')}
          >
            Universidades
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading && <p className="ranking-empty">Cargando…</p>}

        {!loading && !error && tab === 'players' && (
          players.length === 0 ? (
            <p className="ranking-empty">Aún no hay partidas registradas. ¡Sé el primero!</p>
          ) : (
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-left">Jugador</th>
                  <th className="col-left">Universidad</th>
                  <th>ELO</th>
                  <th>V - D</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.username} className={p.username === user.username ? 'me' : ''}>
                    <td>{p.position}</td>
                    <td className="col-left">
                      {p.username}
                      {p.username === user.username && <span className="me-tag"> (tú)</span>}
                    </td>
                    <td className="col-left">{p.university}</td>
                    <td className="col-elo">{p.elo}</td>
                    <td>
                      {p.wins} - {p.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {!loading && !error && tab === 'universities' && (
          universities.length === 0 ? (
            <p className="ranking-empty">Aún no hay partidas registradas.</p>
          ) : (
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-left">Universidad</th>
                  <th>ELO total</th>
                  <th>Jugadores</th>
                </tr>
              </thead>
              <tbody>
                {universities.map((u) => (
                  <tr key={u.university} className={u.university === user.university ? 'me' : ''}>
                    <td>{u.position}</td>
                    <td className="col-left">
                      {u.university}
                      {u.university === user.university && <span className="me-tag"> (la tuya)</span>}
                    </td>
                    <td className="col-elo">{u.totalElo}</td>
                    <td>{u.playerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </main>
    </div>
  )
}
