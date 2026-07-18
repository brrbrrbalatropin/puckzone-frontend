import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQueueStatus, leaveQueue, playBot } from '../../services/matchmakingService'

const POLL_INTERVAL_MS = 1500
const MATCHED_PAUSE_MS = 1500
// Entre que matchmaking saca al jugador de la cola y game confirma la sala
// (~2s) el estado es NOT_IN_QUEUE transitoriamente: solo rendirse tras varias
// lecturas seguidas.
const MAX_NOT_IN_QUEUE = 3

/**
 * Sala de espera: pollea el estado de la cola cada 1.5s hasta MATCHED.
 * - WAITING: spinner + contador; pasado el timeout el servidor manda
 *   botAvailable y aparece la opción de jugar contra el bot (el jugador
 *   decide: seguir esperando humano, aceptar el bot o cancelar).
 * - MATCHED: muestra el rival (o BOT) y navega a /game/{matchId} tras una pausa.
 * - NOT_IN_QUEUE persistente: no hay sala en camino → de vuelta al lobby.
 * Los errores de red transitorios no detienen el polling.
 */
export default function Waiting() {
  const navigate = useNavigate()

  const [seconds, setSeconds] = useState(0)
  const [botOffer, setBotOffer] = useState(false)
  const [match, setMatch] = useState(null)
  const stoppedRef = useRef(false)
  const intervalRef = useRef(null)
  const notInQueueRef = useRef(0)

  const goToMatch = (foundMatch) => {
    // El matchId es un UUID que genera el backend: se valida el formato antes
    // de meterlo en la ruta para no pasarle datos crudos de la red al router.
    if (!/^[\w-]+$/.test(foundMatch.matchId)) return
    stoppedRef.current = true
    clearInterval(intervalRef.current)
    setMatch(foundMatch)
    setTimeout(() => {
      // shard: a qué shard de game conectarse (0 si el backend aún no lo manda)
      const shard = Number.isInteger(foundMatch.shard) ? foundMatch.shard : 0
      navigate(`/game/${encodeURIComponent(foundMatch.matchId)}?shard=${shard}`, { replace: true })
    }, MATCHED_PAUSE_MS)
  }

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
        goToMatch(status.match)
      } else if (status.status === 'NOT_IN_QUEUE') {
        notInQueueRef.current += 1
        if (notInQueueRef.current >= MAX_NOT_IN_QUEUE) {
          stoppedRef.current = true
          clearInterval(intervalRef.current)
          navigate('/', { replace: true })
        }
      } else {
        notInQueueRef.current = 0
        setSeconds(status.secondsWaiting ?? 0)
        setBotOffer(Boolean(status.botAvailable))
      }
    }

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    poll()

    return () => {
      stoppedRef.current = true
      clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const handlePlayBot = async () => {
    try {
      const status = await playBot()
      goToMatch(status.match)
    } catch {
      // 409: ya no estaba en cola (quizá lo emparejó un humano);
      // el polling resuelve solo (MATCHED o NOT_IN_QUEUE).
    }
  }

  const handleCancel = async () => {
    stoppedRef.current = true
    clearInterval(intervalRef.current)
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
            {botOffer ? (
              <>
                <p className="waiting-hint">
                  No aparece un rival todavía. Puedes seguir esperando o jugar
                  contra el bot (no afecta tu ELO).
                </p>
                <button type="button" className="waiting-bot" onClick={handlePlayBot}>
                  Jugar contra el bot
                </button>
              </>
            ) : (
              <p className="waiting-hint">Emparejando por nivel…</p>
            )}
            <button type="button" onClick={handleCancel}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
