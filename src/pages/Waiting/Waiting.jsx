import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQueueStatus, leaveQueue } from '../../services/matchmakingService'

const POLL_INTERVAL_MS = 1500
const MATCHED_PAUSE_MS = 1500
// Entre que matchmaking saca al jugador de la cola y game confirma la sala
// (~2s) el estado es NOT_IN_QUEUE transitoriamente: solo rendirse tras varias
// lecturas seguidas.
const MAX_NOT_IN_QUEUE = 3

/**
 * Sala de espera: pollea el estado de la cola cada 1.5s hasta MATCHED.
 * - WAITING: spinner + contador de segundos (el que reporta el servidor).
 * - MATCHED: muestra el rival (o BOT) y navega a /game/{matchId} tras una pausa.
 * - NOT_IN_QUEUE persistente: no hay sala en camino → de vuelta al lobby.
 * Los errores de red transitorios no detienen el polling.
 */
export default function Waiting() {
  const navigate = useNavigate()

  const [seconds, setSeconds] = useState(0)
  const [match, setMatch] = useState(null)
  const stoppedRef = useRef(false)
  const notInQueueRef = useRef(0)

  useEffect(() => {
    stoppedRef.current = false
    notInQueueRef.current = 0

    const poll = async () => {
      let status
      try {
        status = await getQueueStatus()
      } catch {
        return // transitorio: el siguiente intento puede funcionar
      }
      if (stoppedRef.current) return

      if (status.status === 'MATCHED') {
        stoppedRef.current = true
        clearInterval(intervalId)
        setMatch(status.match)
        setTimeout(() => {
          navigate(`/game/${status.match.matchId}`, { replace: true })
        }, MATCHED_PAUSE_MS)
      } else if (status.status === 'NOT_IN_QUEUE') {
        notInQueueRef.current += 1
        if (notInQueueRef.current >= MAX_NOT_IN_QUEUE) {
          stoppedRef.current = true
          clearInterval(intervalId)
          navigate('/', { replace: true })
        }
      } else {
        notInQueueRef.current = 0
        setSeconds(status.secondsWaiting ?? 0)
      }
    }

    const intervalId = setInterval(poll, POLL_INTERVAL_MS)
    poll()

    return () => {
      stoppedRef.current = true
      clearInterval(intervalId)
    }
  }, [navigate])

  const handleCancel = async () => {
    stoppedRef.current = true
    try {
      await leaveQueue()
    } finally {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card waiting-card">
        {match ? (
          <>
            <h2>¡Rival encontrado!</h2>
            {match.opponentType === 'BOT' ? (
              <p className="waiting-opponent">
                Jugarás contra el <strong>BOT</strong>
              </p>
            ) : (
              <p className="waiting-opponent">
                <strong>{match.opponentUsername}</strong>
                {match.opponentUniversity && (
                  <span className="waiting-university">
                    {' '}
                    ({match.opponentUniversity})
                  </span>
                )}
              </p>
            )}
            <p className="waiting-hint">Entrando a la partida…</p>
          </>
        ) : (
          <>
            <h2>Buscando rival…</h2>
            <div className="waiting-spinner" aria-label="Buscando" />
            <p className="waiting-seconds">{seconds}s en cola</p>
            <p className="waiting-hint">
              Si no aparece un rival en 10 segundos, jugarás contra el bot.
            </p>
            <button type="button" onClick={handleCancel}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
