import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePing } from '../../hooks/usePing'
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
// Interpolación: se renderiza este margen "en el pasado", entre los dos
// últimos estados recibidos — el jitter de red deja de verse como saltos.
const INTERP_DELAY_MS = 100
// Un salto mayor a esto es un teletransporte legítimo (saque tras gol):
// se pinta directo en vez de barrer la cancha interpolando.
const SNAP_DIST = 200

/**
 * La cancha. El estado llega a ~60Hz por /topic/game/{id} y vive en refs:
 * el canvas se repinta con requestAnimationFrame INTERPOLANDO entre los dos
 * últimos estados (fluidez ante jitter de red). La paleta propia se predice
 * localmente (se dibuja donde está el mouse, con el mismo recorte del
 * servidor) para que responda sin esperar el round-trip; el disco y el rival
 * son 100% del servidor, que sigue siendo autoritativo.
 * React solo re-renderiza con cambios de status/marcador (overlays y HUD).
 */
export default function Game() {
  const { matchId } = useParams()
  const { user, token } = useAuth()
  const ping = usePing()

  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const prevRef = useRef(null) // {s, t}: estado anterior y cuándo llegó
  const currRef = useRef(null) // {s, t}: último estado y cuándo llegó
  const myPaddleRef = useRef(null) // predicción local {x, y}
  const connectionRef = useRef(null)
  const lastSentRef = useRef(0)

  // Solo lo que afecta el HUD/overlays; las posiciones a 60Hz nunca pasan
  // por React (viven en los refs y las consume el bucle de canvas).
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
        prevRef.current = currRef.current
        currRef.current = { s: state, t: performance.now() }
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

  // Mouse a nivel de WINDOW: la paleta sigue respondiendo aunque el puntero
  // salga del canvas (antes se congelaba al salir del tablero en desktop).
  useEffect(() => {
    const onPointerMove = (event) => {
      const canvas = canvasRef.current
      const connection = connectionRef.current
      if (!canvas || !connection) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return

      // De píxeles de pantalla (canvas escalado por CSS) a coordenadas del tablero.
      const x = ((event.clientX - rect.left) / rect.width) * BOARD_W
      const y = ((event.clientY - rect.top) / rect.height) * BOARD_H

      // Predicción local con el MISMO recorte que aplica el servidor.
      const state = stateRef.current
      const iAmP1 = !state || state.player1?.userId === user.userId
      myPaddleRef.current = {
        x: clamp(x, iAmP1 ? PADDLE_R : BOARD_W / 2 + PADDLE_R,
          iAmP1 ? BOARD_W / 2 - PADDLE_R : BOARD_W - PADDLE_R),
        y: clamp(y, PADDLE_R, BOARD_H - PADDLE_R),
      }

      const now = performance.now()
      if (now - lastSentRef.current < PADDLE_SEND_MS) return
      lastSentRef.current = now
      connection.sendPaddle(x, y)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [user.userId])

  // Bucle de pintado: interpola entre los dos últimos estados del servidor.
  useEffect(() => {
    let frameId
    const draw = () => {
      const canvas = canvasRef.current
      if (canvas) {
        const renderState = interpolate(prevRef.current, currRef.current)
        drawBoard(canvas.getContext('2d'), renderState, user.userId, myPaddleRef.current)
      }
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [user.userId])

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
        <span
          className={`game-ping ${ping === null ? 'bad' : ping < 80 ? 'good' : ping < 150 ? 'mid' : 'bad'}`}
          title="Latencia hacia el servidor"
        >
          · {ping === null ? '— ' : ping}ms
        </span>
      </header>

      <div className="game-board-wrap">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          className="game-canvas"
        />

        {(!connected || !ui.status || ui.status === 'WAITING') && (
          <div className="game-overlay">
            <p>{connected ? 'Esperando al rival…' : 'Conectando…'}</p>
          </div>
        )}

        {ui.status === 'FINISHED' && (
          <div className="game-overlay">
            <h2>{myScore > rivalScore ? '¡Ganaste!' : 'Perdiste'}</h2>
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
        Mueve el mouse (o el dedo) para controlar tu paleta
        {iAmPlayer1 ? ' (lado izquierdo, cian)' : ' (lado derecho, cian)'}. Gana el primero en llegar a 7.
      </p>
    </div>
  )
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Estado a renderizar: interpola las posiciones entre los dos últimos
 * estados, con el reloj corrido INTERP_DELAY_MS al pasado. Los saltos
 * grandes (saque tras gol) se pintan directo (snap) en vez de interpolarse.
 */
function interpolate(prev, curr) {
  if (!curr) return null
  if (!prev || curr.t <= prev.t) return curr.s

  const alpha = clamp(
    (performance.now() - INTERP_DELAY_MS - prev.t) / (curr.t - prev.t),
    0,
    1,
  )
  const lerp = (a, b) =>
    Math.abs(b - a) > SNAP_DIST ? b : a + (b - a) * alpha

  return {
    ...curr.s,
    puckX: lerp(prev.s.puckX, curr.s.puckX),
    puckY: lerp(prev.s.puckY, curr.s.puckY),
    paddle1X: lerp(prev.s.paddle1X, curr.s.paddle1X),
    paddle1Y: lerp(prev.s.paddle1Y, curr.s.paddle1Y),
    paddle2X: lerp(prev.s.paddle2X, curr.s.paddle2X),
    paddle2Y: lerp(prev.s.paddle2Y, curr.s.paddle2Y),
  }
}

/** Pinta el tablero; la paleta propia usa la predicción local si existe. */
function drawBoard(ctx, state, myUserId, myPredicted) {
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

  // Mi paleta en la posición predicha (respuesta inmediata al mouse);
  // la del rival en la posición interpolada del servidor.
  const my = myPredicted ?? {
    x: iAmPlayer1 ? state.paddle1X : state.paddle2X,
    y: iAmPlayer1 ? state.paddle1Y : state.paddle2Y,
  }
  const rival = {
    x: iAmPlayer1 ? state.paddle2X : state.paddle1X,
    y: iAmPlayer1 ? state.paddle2Y : state.paddle1Y,
  }
  drawPaddle(ctx, my.x, my.y, myColor)
  drawPaddle(ctx, rival.x, rival.y, rivalColor)

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
