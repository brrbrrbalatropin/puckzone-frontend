import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import {
  cancelPrivateRoom,
  createPrivateRoom,
  getPrivateRoomStatus,
  joinPrivateRoom,
} from '../../services/matchmakingService'

const POLL_INTERVAL_MS = 2000

/**
 * Salas privadas: jugar con un amigo por código, como partida amistosa
 * (no mueve ELO). Dos caminos: crear la sala (muestra el código para
 * compartir y pollea hasta que el amigo entre) o digitar el código de otro
 * (la partida arranca de inmediato). En ambos casos se navega a /game.
 */
export default function Rooms() {
  const navigate = useNavigate()

  const [room, setRoom] = useState(null) // {code} mientras se espera al amigo
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const stoppedRef = useRef(false)

  // Si ya tenía una sala abierta (volvió a la página), se retoma; si el
  // amigo entró mientras tanto (MATCHED), directo a la partida.
  useEffect(() => {
    stoppedRef.current = false

    const poll = async () => {
      let status
      try {
        status = await getPrivateRoomStatus()
      } catch {
        return // transitorio; el siguiente intento puede funcionar
      }
      if (stoppedRef.current) return

      if (status.status === 'MATCHED') {
        stoppedRef.current = true
        navigate(`/game/${status.match.matchId}?shard=${status.match.shard ?? 0}`, { replace: true })
      } else if (status.status === 'WAITING') {
        setRoom({ code: status.code })
      } else {
        setRoom(null)
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS)
    poll()
    return () => {
      stoppedRef.current = true
      clearInterval(interval)
    }
  }, [navigate])

  const handleCreate = async () => {
    setError('')
    setCreating(true)
    setCopied(false)
    try {
      const status = await createPrivateRoom()
      setRoom({ code: status.code })
    } catch {
      setError('No se pudo crear la sala. Intenta de nuevo.')
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async () => {
    setRoom(null)
    setCopied(false)
    try {
      await cancelPrivateRoom()
    } catch {
      // Idempotente; si falló, el TTL la limpia sola.
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de clipboard: el código está visible para copiarlo a mano.
    }
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setError('')
    setJoining(true)
    try {
      const status = await joinPrivateRoom(code)
      navigate(`/game/${status.match.matchId}?shard=${status.match.shard ?? 0}`)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Código inválido, vencido o ya usado.')
      } else if (err.response?.status === 409) {
        setError('Ese código es de tu propia sala: compártelo con tu amigo.')
      } else {
        setError('No se pudo entrar a la sala. Intenta de nuevo.')
      }
      setJoining(false)
    }
  }

  return (
    <div className="app-page">
      <Header />

      <main className="rooms-main">
        <h2>Salas privadas</h2>
        <p className="rooms-hint">
          Juega con un amigo sin esperar cola: crea una sala y pásale el
          código, o digita el que te compartieron. Las partidas por código son
          amistosas — <strong>no afectan el ELO</strong>.
        </p>

        <div className="rooms-grid">
          <section className="rooms-card">
            <h3>Crear sala</h3>
            {room ? (
              <>
                <p className="rooms-card-hint">
                  Comparte este código; en cuanto tu amigo lo digite, la
                  partida arranca sola.
                </p>
                <div className="room-code" aria-label="Código de la sala">
                  {room.code}
                </div>
                <div className="room-wait">
                  <span className="waiting-spinner small" aria-hidden="true" />
                  Esperando a tu amigo…
                </div>
                <div className="rooms-actions">
                  <button type="button" onClick={handleCopy}>
                    {copied ? '¡Copiado!' : 'Copiar código'}
                  </button>
                  <button type="button" className="ghost-button" onClick={handleCancel}>
                    Cancelar sala
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="rooms-card-hint">
                  Genera un código de 6 caracteres y compártelo. La sala vive
                  10 minutos.
                </p>
                <button type="button" onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creando…' : 'Crear sala'}
                </button>
              </>
            )}
          </section>

          <section className="rooms-card">
            <h3>Unirse con código</h3>
            <p className="rooms-card-hint">
              Digita el código que te pasaron y entra directo a la partida.
            </p>
            <form className="room-join-form" onSubmit={handleJoin}>
              <input
                type="text"
                value={joinCode}
                maxLength={6}
                placeholder="ABC123"
                autoCapitalize="characters"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button type="submit" disabled={joining || joinCode.trim().length < 6}>
                {joining ? 'Entrando…' : 'Unirse'}
              </button>
            </form>
          </section>
        </div>

        {error && <p className="form-error">{error}</p>}
      </main>
    </div>
  )
}
