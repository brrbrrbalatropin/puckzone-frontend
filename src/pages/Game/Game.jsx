import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { createGameConnection } from '../../services/gameSocket'

// Dimensiones lógicas del motor de física (puckzone-game). El canvas usa
// estas y se escala visualmente por CSS; el mouse se convierte de vuelta.
const BOARD_W = 800
const BOARD_H = 500
const GOAL_W = 200
const PUCK_R = 15
const PADDLE_R = 30
// No tiene sentido enviar el mouse más rápido que el tick del servidor (60Hz).
const PADDLE_SEND_MS = 16

/**
 * La cancha. El estado llega a 60Hz por /topic/game/{id} y vive en un ref:
 * el canvas se repinta con requestAnimationFrame sin pasar por React.
 * React solo re-renderiza con cambios de status/marcador (overlays y HUD).
 * El servidor es autoritativo: se envía el mouse y se pinta lo que llega.
 */
export default function Game() {
  const { matchId } = useParams()
  const { user, token } = useAuth()

  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const connectionRef = useRef(null)
  const lastSentRef = useRef(0)

  // Solo lo que afecta el HUD/overlays; las posiciones a 60Hz nunca pasan
  // por React (viven en stateRef y las consume el bucle de canvas).
  const [ui, setUi] = useState({
    status: null,
    score1: 0,
    score2: 0,
    player1UserId: null,
    player1Username: null,
    player2Username: null,
    opponentType: null,
  })
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const connection = createGameConnection({
      gameId: matchId,
      userId: user.userId,
      token,
      onState: (state) => {
        stateRef.current = state
        setUi((prev) =>
          prev.status === state.status &&
          prev.score1 === state.score1 &&
          prev.score2 === state.score2 &&
          prev.player1UserId === state.player1?.userId
            ? prev
            : {
                status: state.status,
                score1: state.score1,
                score2: state.score2,
                player1UserId: state.player1?.userId ?? null,
                player1Username: state.player1?.username ?? null,
                player2Username: state.player2?.username ?? null,
                opponentType: state.opponentType,
              },
        )
      },
      onConnectionChange: setConnected,
    })
    connectionRef.current = connection
    return () => {
      connectionRef.current = null
      connection.disconnect()
    }
  }, [matchId, user.userId, token])

  // Bucle de pintado: corre mientras la pantalla esté montada.
  useEffect(() => {
    let frameId
    const draw = () => {
      const canvas = canvasRef.current
      if (canvas) {
        drawBoard(canvas.getContext('2d'), stateRef.current, user.userId)
      }
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [user.userId])

  const handlePointerMove = useCallback(
    (event) => {
      const canvas = canvasRef.current
      const connection = connectionRef.current
      if (!canvas || !connection) return

      const now = performance.now()
      if (now - lastSentRef.current < PADDLE_SEND_MS) return
      lastSentRef.current = now

      // De píxeles de pantalla (canvas escalado por CSS) a coordenadas del tablero.
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * BOARD_W
      const y = ((event.clientY - rect.top) / rect.height) * BOARD_H
      connection.sendPaddle(x, y)
    },
    [],
  )

  const iAmPlayer1 = !ui.player1UserId || ui.player1UserId === user.userId
  const rivalName =
    ui.opponentType === 'BOT'
      ? 'BOT'
      : ((iAmPlayer1 ? ui.player2Username : ui.player1Username) ?? 'Rival')
  const myScore = iAmPlayer1 ? ui.score1 : ui.score2
  const rivalScore = iAmPlayer1 ? ui.score2 : ui.score1

  return (
    <div className="game-page">
      <header className="game-hud">
        <span className="game-player me">
          {user.username} <strong>{myScore}</strong>
        </span>
        <span className="game-vs">—</span>
        <span className="game-player rival">
          <strong>{rivalScore}</strong> {rivalName}
        </span>
      </header>

      <div className="game-board-wrap">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          className="game-canvas"
          onPointerMove={handlePointerMove}
        />

        {(!connected || !ui.status || ui.status === 'WAITING') && (
          <div className="game-overlay">
            <p>{connected ? 'Esperando al rival…' : 'Conectando…'}</p>
          </div>
        )}

        {ui.status === 'FINISHED' && (
          <div className="game-overlay">
            <h2>{myScore > rivalScore ? '¡Ganaste! 🏆' : 'Perdiste 😞'}</h2>
            <p>
              {myScore} — {rivalScore} contra {rivalName}
            </p>
            <Link to="/" className="game-back">
              Volver al lobby
            </Link>
          </div>
        )}
      </div>

      <p className="game-hint">
        Mueve el mouse sobre la cancha para controlar tu paleta
        {iAmPlayer1 ? ' (lado izquierdo, cian)' : ' (lado derecho, cian)'}. Gana el primero en llegar a 7.
      </p>
    </div>
  )
}

/** Pinta el tablero completo a partir del último GameState recibido. */
function drawBoard(ctx, state, myUserId) {
  // Fondo y borde
  ctx.fillStyle = '#0d1220'
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, BOARD_W - 4, BOARD_H - 4)

  // Línea y círculo central
  ctx.strokeStyle = '#27334d'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(BOARD_W / 2, 0)
  ctx.lineTo(BOARD_W / 2, BOARD_H)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(BOARD_W / 2, BOARD_H / 2, 60, 0, Math.PI * 2)
  ctx.stroke()

  // Porterías (centradas verticalmente en cada extremo)
  const goalTop = (BOARD_H - GOAL_W) / 2
  ctx.lineWidth = 6
  ctx.strokeStyle = '#00d4ff'
  ctx.beginPath()
  ctx.moveTo(3, goalTop)
  ctx.lineTo(3, goalTop + GOAL_W)
  ctx.stroke()
  ctx.strokeStyle = '#ff0080'
  ctx.beginPath()
  ctx.moveTo(BOARD_W - 3, goalTop)
  ctx.lineTo(BOARD_W - 3, goalTop + GOAL_W)
  ctx.stroke()

  if (!state) return

  const iAmPlayer1 = state.player1?.userId === myUserId
  const myColor = '#00d4ff'
  const rivalColor = '#ff0080'

  // Paletas: la mía siempre cian, la del rival magenta
  drawPaddle(ctx, state.paddle1X, state.paddle1Y, iAmPlayer1 ? myColor : rivalColor)
  drawPaddle(ctx, state.paddle2X, state.paddle2Y, iAmPlayer1 ? rivalColor : myColor)

  // Disco
  ctx.beginPath()
  ctx.arc(state.puckX, state.puckY, PUCK_R, 0, Math.PI * 2)
  ctx.fillStyle = '#e0e0e0'
  ctx.shadowColor = '#e0e0e0'
  ctx.shadowBlur = 12
  ctx.fill()
  ctx.shadowBlur = 0
}

function drawPaddle(ctx, x, y, color) {
  ctx.beginPath()
  ctx.arc(x, y, PADDLE_R, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  ctx.fill()
  ctx.shadowBlur = 0
  // Anillo interior para darle relieve de paleta de air hockey
  ctx.beginPath()
  ctx.arc(x, y, PADDLE_R * 0.55, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(10, 10, 15, 0.55)'
  ctx.lineWidth = 3
  ctx.stroke()
}
