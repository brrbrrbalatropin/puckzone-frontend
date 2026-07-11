import { useCallback, useEffect, useRef, useState } from 'react'
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
// 60ms ≈ 4 estados de buffer: suficiente contra jitter sin agregar más
// retardo del necesario (la paleta propia también carga este delay).
const INTERP_DELAY_MS = 60
// Emotes: ids de la lista blanca del servidor, en orden de hotkey (1-6).
const EMOTES = [
  { id: 'THUMBS_UP', icon: '👍' },
  { id: 'LAUGH', icon: '😂' },
  { id: 'WOW', icon: '😮' },
  { id: 'CRY', icon: '😭' },
  { id: 'ANGRY', icon: '😡' },
  { id: 'GG', icon: 'GG' },
]
// Cuánto vive la burbuja en pantalla; el server además tiene cooldown de 1s.
const EMOTE_BUBBLE_MS = 2500
// Poderes: ícono y color por tipo (mismo catálogo del servidor).
const POWER_META = {
  OBSTACLE: { icon: '🧱', color: '#9ca3af' },
  FAST_ZONE: { icon: '⚡', color: '#ffb020' },
  SLOW_ZONE: { icon: '🐌', color: '#4f7cff' },
  GHOST_PUCK: { icon: '👻', color: '#c084fc' },
  SHIELD: { icon: '🛡️', color: '#34d399' },
  CHAOS: { icon: '💥', color: '#ff5060' },
}
// Radio del pickup en el servidor (puckzone.game.power.pickup-radius).
const PICKUP_R = 18
// Un salto mayor a esto es un teletransporte legítimo (saque tras gol):
// se pinta directo en vez de barrer la cancha interpolando.
const SNAP_DIST = 200

/**
 * La cancha. El estado llega a ~60Hz por /topic/game/{id} y vive en refs:
 * el canvas se repinta con requestAnimationFrame INTERPOLANDO entre los dos
 * últimos estados (fluidez ante jitter de red). TODO se pinta desde el
 * servidor, incluida la paleta propia: se probó predecirla localmente y los
 * golpes se veían erráticos (el disco "del pasado" chocaba contra una paleta
 * "del presente" — dos líneas de tiempo en pantalla). Coherencia > respuesta.
 * React solo re-renderiza con cambios de status/marcador (overlays y HUD).
 */
export default function Game() {
  const { matchId } = useParams()
  const { user, token } = useAuth()
  const ping = usePing()

  const canvasRef = useRef(null)
  const prevRef = useRef(null) // {s, t}: estado anterior y cuándo llegó
  const currRef = useRef(null) // {s, t}: último estado y cuándo llegó
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
    winnerId: null,
    finishReason: null,
    graceDeadlineEpochMs: 0,
  })
  const [connected, setConnected] = useState(false)
  // Confirmación de rendición ("¿estás seguro?"); el servidor solo recibe
  // el surrender ya confirmado.
  const [confirmSurrender, setConfirmSurrender] = useState(false)
  // Reloj para la cuenta regresiva de la pausa; solo avanza (por timer)
  // mientras la partida está pausada.
  const [nowMs, setNowMs] = useState(0)
  // Burbujas de emote por mitad de cancha; `key` distingue emisiones para
  // reiniciar la animación y para que el timeout no borre una burbuja nueva.
  const [bubbles, setBubbles] = useState({ left: null, right: null })
  const bubbleSeqRef = useRef(0)
  const lastEmoteSentRef = useRef(0)

  useEffect(() => {
    const connection = createGameConnection({
      gameId: matchId,
      userId: user.userId,
      token,
      onEmote: ({ userId: senderId, emote }) => {
        const icon = EMOTES.find((e) => e.id === emote)?.icon
        const p1Id = currRef.current?.s?.player1?.userId
        if (!icon || !p1Id) return
        const side = senderId === p1Id ? 'left' : 'right'
        const key = ++bubbleSeqRef.current
        setBubbles((prev) => ({ ...prev, [side]: { icon, key } }))
        setTimeout(() => {
          setBubbles((prev) =>
            prev[side]?.key === key ? { ...prev, [side]: null } : prev,
          )
        }, EMOTE_BUBBLE_MS)
      },
      onState: (state) => {
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
                winnerId: state.winnerId ?? null,
                finishReason: state.finishReason ?? null,
                graceDeadlineEpochMs: state.graceDeadlineEpochMs ?? 0,
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
        drawBoard(canvas.getContext('2d'), renderState, user.userId)
      }
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [user.userId])

  // Solo toca refs: identidad estable, sirve para botones y hotkeys.
  const sendEmote = useCallback((emoteId) => {
    const now = performance.now()
    // Mismo cooldown que el servidor: evita mandar lo que igual descartaría.
    if (now - lastEmoteSentRef.current < 1000) return
    lastEmoteSentRef.current = now
    connectionRef.current?.sendEmote(emoteId)
  }, [])

  useEffect(() => {
    if (ui.status !== 'PAUSED') return undefined
    const update = () => setNowMs(Date.now())
    const timeoutId = setTimeout(update, 0)
    const intervalId = setInterval(update, 500)
    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [ui.status])

  // Hotkeys 1-6 para los emotes.
  useEffect(() => {
    const onKeyDown = (event) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index < EMOTES.length) {
        sendEmote(EMOTES[index].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sendEmote])

  const iAmPlayer1 = !ui.player1UserId || ui.player1UserId === user.userId
  const rivalName =
    ui.opponentType === 'BOT'
      ? 'BOT'
      : ((iAmPlayer1 ? ui.player2Username : ui.player1Username) ?? 'Rival')
  const myScore = iAmPlayer1 ? ui.score1 : ui.score2
  const rivalScore = iAmPlayer1 ? ui.score2 : ui.score1
  const iWon = ui.winnerId ? ui.winnerId === user.userId : myScore > rivalScore
  const finishDetail =
    ui.finishReason === 'SURRENDER'
      ? iWon
        ? 'Tu rival se rindió.'
        : 'Te rendiste.'
      : ui.finishReason === 'DISCONNECT'
        ? iWon
          ? 'Tu rival abandonó la partida.'
          : 'Perdiste por abandono.'
        : null
  const canSurrender =
    connected && (ui.status === 'PLAYING' || ui.status === 'PAUSED')
  const graceLeft =
    ui.status === 'PAUSED' && ui.graceDeadlineEpochMs && nowMs
      ? Math.max(0, Math.ceil((ui.graceDeadlineEpochMs - nowMs) / 1000))
      : null

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

        {connected && ui.status === 'PAUSED' && (
          <div className="game-overlay">
            <h2>Rival desconectado</h2>
            <p>
              Si no vuelve{graceLeft !== null ? ` en ${graceLeft}s` : ' a tiempo'},
              ganas por abandono.
            </p>
          </div>
        )}

        {ui.status === 'FINISHED' && (
          <div className="game-overlay">
            <h2>{iWon ? '¡Ganaste!' : 'Perdiste'}</h2>
            {finishDetail && <p className="finish-detail">{finishDetail}</p>}
            <p>
              {myScore} — {rivalScore} contra {rivalName}
            </p>
            <Link to="/" className="game-back">
              Volver al lobby
            </Link>
          </div>
        )}

        {confirmSurrender && ui.status !== 'FINISHED' && (
          <div className="game-overlay">
            <h2>¿Rendirse?</h2>
            <p>Tu rival ganará la partida.</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="surrender-button"
                onClick={() => {
                  connectionRef.current?.sendSurrender()
                  setConfirmSurrender(false)
                }}
              >
                Sí, rendirme
              </button>
              <button type="button" onClick={() => setConfirmSurrender(false)}>
                Seguir jugando
              </button>
            </div>
          </div>
        )}

        {bubbles.left && (
          <span key={bubbles.left.key} className="emote-bubble left">
            {bubbles.left.icon}
          </span>
        )}
        {bubbles.right && (
          <span key={bubbles.right.key} className="emote-bubble right">
            {bubbles.right.icon}
          </span>
        )}
      </div>

      <div className="emote-bar">
        {EMOTES.map((emote, index) => (
          <button
            key={emote.id}
            type="button"
            className="emote-button"
            title={`Tecla ${index + 1}`}
            onClick={() => sendEmote(emote.id)}
          >
            <span className="emote-icon">{emote.icon}</span>
            <span className="emote-key">{index + 1}</span>
          </button>
        ))}
        {canSurrender && (
          <button
            type="button"
            className="surrender-button"
            onClick={() => setConfirmSurrender(true)}
          >
            Rendirse
          </button>
        )}
      </div>

      <p className="game-hint">
        Mueve el mouse (o el dedo) para controlar tu paleta
        {iAmPlayer1 ? ' (lado izquierdo, cian)' : ' (lado derecho, cian)'}. Gana el primero en llegar a 7.
        Toca los poderes que aparecen en el tablero para activarlos: 🧱 obstáculo,
        ⚡ zona rápida, 🐌 zona lenta, 👻 disco fantasma, 🛡️ escudo y 💥 caos.
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

/** Pinta el tablero completo desde el estado interpolado del servidor. */
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

  // Poderes: zonas y obstáculo debajo de las piezas, el pickup encima.
  drawEffects(ctx, state)
  drawPickup(ctx, state)

  const iAmPlayer1 = state.player1?.userId === myUserId
  const myColor = '#00d4ff'
  const rivalColor = '#ff0080'

  // Ambas paletas desde el servidor (radio incluido: el escudo lo dobla):
  // lo que ves es lo que colisiona.
  drawPaddle(ctx, state.paddle1X, state.paddle1Y,
    iAmPlayer1 ? myColor : rivalColor, state.paddle1Radius || PADDLE_R)
  drawPaddle(ctx, state.paddle2X, state.paddle2Y,
    iAmPlayer1 ? rivalColor : myColor, state.paddle2Radius || PADDLE_R)

  // Disco (el fantasma no se pinta hasta que rebote)
  if (state.puckVisible !== false) {
    ctx.beginPath()
    ctx.arc(state.puckX, state.puckY, PUCK_R, 0, Math.PI * 2)
    ctx.fillStyle = '#e0e0e0'
    ctx.shadowColor = '#e0e0e0'
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
  }

  drawPowerBadges(ctx, state)
}

/** Zonas translúcidas y obstáculos sólidos, anclados donde estaba el pickup. */
function drawEffects(ctx, state) {
  for (const effect of state.effects ?? []) {
    const meta = POWER_META[effect.type]
    if (!meta) continue
    if (effect.type === 'FAST_ZONE' || effect.type === 'SLOW_ZONE') {
      ctx.beginPath()
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2)
      ctx.fillStyle = `${meta.color}22`
      ctx.fill()
      ctx.strokeStyle = `${meta.color}88`
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.stroke()
      ctx.setLineDash([])
      drawIcon(ctx, meta.icon, effect.x, effect.y, 20)
    } else if (effect.type === 'OBSTACLE') {
      ctx.beginPath()
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2)
      ctx.fillStyle = '#374151'
      ctx.fill()
      ctx.strokeStyle = '#6b7280'
      ctx.lineWidth = 3
      ctx.stroke()
      drawIcon(ctx, meta.icon, effect.x, effect.y, 22)
    }
    // SHIELD no se pinta aquí: se ve en el tamaño de la paleta del dueño.
  }
}

/** El pickup parpadea durante el aviso previo; fijo y con brillo cuando ya se puede recoger. */
function drawPickup(ctx, state) {
  const pickup = state.pickup
  if (!pickup) return
  const meta = POWER_META[pickup.type]
  if (!meta) return

  const blinking = Date.now() < pickup.activeFromEpochMs
  // Apagado la mitad del tiempo, ~3 veces por segundo.
  if (blinking && Math.floor(performance.now() / 180) % 2 === 0) return

  ctx.beginPath()
  ctx.arc(pickup.x, pickup.y, PICKUP_R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(17, 24, 39, 0.9)'
  if (!blinking) {
    ctx.shadowColor = meta.color
    ctx.shadowBlur = 14
  }
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = meta.color
  ctx.lineWidth = 2.5
  ctx.stroke()
  drawIcon(ctx, meta.icon, pickup.x, pickup.y, 18)
}

/** Avisos de los poderes sin representación espacial (caos armado, fantasma). */
function drawPowerBadges(ctx, state) {
  const badges = []
  if (state.chaosArmed) badges.push('💥 Caos: el próximo golpe sale al doble')
  if (state.puckVisible === false) badges.push('👻 Disco fantasma: reaparece al rebotar')
  badges.forEach((text, index) => {
    const y = 18 + index * 26
    ctx.font = '13px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const width = ctx.measureText(text).width + 20
    ctx.fillStyle = 'rgba(13, 18, 32, 0.8)'
    ctx.fillRect(BOARD_W / 2 - width / 2, y - 11, width, 22)
    ctx.fillStyle = '#e0e0e0'
    ctx.fillText(text, BOARD_W / 2, y)
  })
}

function drawIcon(ctx, icon, x, y, size) {
  ctx.font = `${size}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e0e0e0'
  ctx.fillText(icon, x, y + 1)
}

function drawPaddle(ctx, x, y, color, radius = PADDLE_R) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  ctx.fill()
  ctx.shadowBlur = 0
  // Anillo interior para darle relieve de paleta de air hockey
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(10, 10, 15, 0.55)'
  ctx.lineWidth = 3
  ctx.stroke()
}
