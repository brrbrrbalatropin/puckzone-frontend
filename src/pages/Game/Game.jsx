import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePing } from '../../hooks/usePing'
import { useSettings } from '../../hooks/useSettings'
import { createGameConnection } from '../../services/gameSocket'
import { playSfx, playRebote, POWER_SFX } from '../../services/soundService'
import { createVoiceChat } from '../../services/voiceChat'

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
// Estados del chat de voz (voiceChat.js) traducidos para el jugador.
const VOICE_LABELS = {
  'requesting-mic': 'pidiendo micrófono…',
  'waiting-rival': 'esperando al rival…',
  connecting: 'conectando…',
  connected: 'conectada',
  'listen-only': 'sin micrófono: solo escuchas',
  'no-mic': 'sin micrófono: solo escucharás',
  failed: 'no disponible en esta red',
  'rival-off': 'el rival la cortó',
}
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
 * últimos estados (fluidez ante jitter de red). Cada pieza se pinta desde el
 * servidor, incluida la paleta propia: se probó predecirla localmente y los
 * golpes se veían erráticos (el disco "del pasado" chocaba contra una paleta
 * "del presente" — dos líneas de tiempo en pantalla). Coherencia > respuesta.
 * React solo re-renderiza con cambios de status/marcador (overlays y HUD).
 */
export default function Game() {
  const { matchId } = useParams()
  // Shard de game dueño de la sala (?shard=N, default 0): en la URL para
  // que un refresh a mitad de partida reconecte al shard correcto.
  const [searchParams] = useSearchParams()
  const shard = Number(searchParams.get('shard')) || 0
  const { user, token } = useAuth()
  const { settings, effectiveVolume } = useSettings()
  const ping = usePing()

  const canvasRef = useRef(null)
  const prevRef = useRef(null) // {s, t}: estado anterior y cuándo llegó
  const currRef = useRef(null) // {s, t}: último estado y cuándo llegó
  const connectionRef = useRef(null)
  const lastSentRef = useRef(0)
  // Posición virtual de la paleta con el mouse bloqueado (Pointer Lock):
  // el cursor desaparece y la paleta se mueve por deltas acumulados aquí.
  const lockPosRef = useRef(null)

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
    botLevel: 0,
    winnerId: null,
    finishReason: null,
    graceDeadlineEpochMs: 0,
  })
  const [connected, setConnected] = useState(false)
  // Confirmación de rendición ("¿estás seguro?"); el servidor solo recibe
  // el surrender ya confirmado.
  const [confirmSurrender, setConfirmSurrender] = useState(false)
  // Mouse bloqueado dentro del tablero (Pointer Lock del navegador);
  // lo reporta el evento pointerlockchange, no el clic del botón (el
  // navegador puede negar el lock o soltarlo solo con Esc).
  const [mouseLocked, setMouseLocked] = useState(false)
  // Reloj para la cuenta regresiva de la pausa; solo avanza (por timer)
  // mientras la partida está pausada.
  const [nowMs, setNowMs] = useState(0)
  // Burbujas de emote por mitad de cancha; `key` distingue emisiones para
  // reiniciar la animación y para que el timeout no borre una burbuja nueva.
  const [bubbles, setBubbles] = useState({ left: null, right: null })
  const bubbleSeqRef = useRef(0)
  const lastEmoteSentRef = useRef(0)
  // Chat de voz (solo partidas humanas). El módulo WebRTC vive en un ref;
  // React solo conoce el status para pintar botones. Las señales que
  // lleguen antes de crear el módulo se guardan y se le entregan después.
  const voiceRef = useRef(null)
  const pendingVoiceSignalsRef = useRef([])
  const [voiceUi, setVoiceUi] = useState({ status: null, micOn: false, deafened: false })

  // Fuera del effect para no anidar funciones de más (la burbuja programa
  // su propio borrado y el timeout no debe matar una burbuja más nueva).
  const showEmoteBubble = useCallback(({ userId: senderId, emote }) => {
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
  }, [])

  useEffect(() => {
    const connection = createGameConnection({
      gameId: matchId,
      shard,
      userId: user.userId,
      token,
      onEmote: showEmoteBubble,
      onState: (state) => {
        // currRef es el estado anterior y prevRef el de antes: el rebote
        // necesita tres puntos para ver el cambio de dirección.
        playStateSfx(prevRef.current?.s, currRef.current?.s, state, user.userId)
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
                botLevel: state.botLevel ?? 0,
                winnerId: state.winnerId ?? null,
                finishReason: state.finishReason ?? null,
                graceDeadlineEpochMs: state.graceDeadlineEpochMs ?? 0,
              },
        )
      },
      onVoiceSignal: (signal) => {
        // La cola /user/queue/voice es por usuario, no por sala.
        if (signal.gameId !== matchId) return
        if (voiceRef.current) voiceRef.current.handleSignal(signal)
        else pendingVoiceSignalsRef.current.push(signal)
      },
      onConnectionChange: (isUp) => {
        setConnected(isUp)
        // Si nuestro WS se cayó y volvió, el rival no se enteró: la voz
        // se re-anuncia para renegociar si la llamada no sobrevivió.
        if (isUp) voiceRef.current?.refresh()
      },
    })
    connectionRef.current = connection
    return () => {
      connectionRef.current = null
      connection.disconnect()
    }
  }, [matchId, shard, user.userId, token, showEmoteBubble])

  // La voz arranca cuando el estado revela un rival HUMANO y quién es el
  // jugador 1 (iniciador de la negociación WebRTC). Contra el bot no hay.
  useEffect(() => {
    if (ui.opponentType !== 'HUMAN' || !ui.player1UserId || voiceRef.current) return
    const voice = createVoiceChat({
      isInitiator: ui.player1UserId === user.userId,
      sendSignal: (type, payload) =>
        connectionRef.current?.sendVoiceSignal(type, payload),
      onStatusChange: (status) =>
        setVoiceUi((prev) => ({ ...prev, status })),
    })
    voiceRef.current = voice
    const pending = pendingVoiceSignalsRef.current
    pendingVoiceSignalsRef.current = []
    pending.forEach((signal) => voice.handleSignal(signal))
  }, [ui.opponentType, ui.player1UserId, user.userId])

  // Al terminar la partida la voz se corta; al desmontar también (soltar
  // el micrófono es importante: si no, el indicador del navegador queda encendido).
  useEffect(() => {
    if (ui.status === 'FINISHED') voiceRef.current?.close()
  }, [ui.status])
  useEffect(
    () => () => {
      voiceRef.current?.close()
      voiceRef.current = null
    },
    [],
  )

  // Aplica botones + Ajustes al módulo de voz en cada render: el mic suena
  // solo con el botón activo Y el canal micIn sin silenciar; el volumen de
  // salida es el del canal voiceOut y los audífonos en off lo enmudecen.
  useEffect(() => {
    const voice = voiceRef.current
    if (!voice) return
    voice.setMicEnabled(voiceUi.micOn && !settings.micIn.muted)
    voice.setDeafened(voiceUi.deafened)
    voice.setOutputVolume(effectiveVolume('voiceOut'))
  })

  // Mouse a nivel de WINDOW: la paleta sigue respondiendo aunque el puntero
  // salga del canvas (antes se congelaba al salir del tablero en desktop).
  useEffect(() => {
    const onPointerMove = (event) => {
      const canvas = canvasRef.current
      const connection = connectionRef.current
      if (!canvas || !connection) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return

      let x
      let y
      if (document.pointerLockElement === canvas) {
        // Mouse bloqueado: sin cursor no hay posición absoluta; se acumulan
        // los deltas SIEMPRE (aun en ticks descartados por el throttle: si
        // no, el movimiento se perdería y la paleta se sentiría lenta) y se
        // confina la posición virtual a la mitad propia — dejarla derivar
        // hacia la mitad rival crearía una "zona muerta" invisible.
        const state = currRef.current?.s
        const pos = lockPosRef.current ?? { x: BOARD_W / 2, y: BOARD_H / 2 }
        const iAmP1 = !state?.player1?.userId || state.player1.userId === user.userId
        x = pos.x + (event.movementX / rect.width) * BOARD_W
        y = pos.y + (event.movementY / rect.height) * BOARD_H
        x = iAmP1
          ? Math.min(Math.max(x, 0), BOARD_W / 2)
          : Math.min(Math.max(x, BOARD_W / 2), BOARD_W)
        y = Math.min(Math.max(y, 0), BOARD_H)
        lockPosRef.current = { x, y }
      } else {
        // De píxeles de pantalla (canvas escalado por CSS) a coordenadas del tablero.
        x = ((event.clientX - rect.left) / rect.width) * BOARD_W
        y = ((event.clientY - rect.top) / rect.height) * BOARD_H
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
        drawBoard(canvas.getContext('2d'), renderState, user.userId)
      }
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [user.userId])

  // El botón solo PIDE el lock; la verdad la dicta pointerlockchange
  // (el navegador lo suelta solo con Esc o al cambiar de pestaña).
  useEffect(() => {
    const onLockChange = () =>
      setMouseLocked(document.pointerLockElement === canvasRef.current)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [])

  const toggleMouseLock = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock()
      return
    }
    // La posición virtual arranca donde está la paleta propia: el primer
    // movimiento continúa desde ahí en vez de saltar al centro.
    const state = currRef.current?.s
    if (state) {
      const iAmP1 = !state.player1?.userId || state.player1.userId === user.userId
      lockPosRef.current = iAmP1
        ? { x: state.paddle1X, y: state.paddle1Y }
        : { x: state.paddle2X, y: state.paddle2Y }
    }
    // Puede fallar (p.ej. justo tras salir con Esc el navegador lo veta un
    // instante); el estado del botón igual lo dicta pointerlockchange.
    canvas.requestPointerLock()?.catch?.(() => {})
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

  // Solo cambian si la voz existe (status truthy); el effect de arriba
  // aplica el resultado al módulo WebRTC.
  const toggleMic = useCallback(() => {
    setVoiceUi((prev) => (prev.status ? { ...prev, micOn: !prev.micOn } : prev))
  }, [])
  const toggleDeafen = useCallback(() => {
    setVoiceUi((prev) => (prev.status ? { ...prev, deafened: !prev.deafened } : prev))
  }, [])

  // Hotkeys: 1-6 emotes, M micrófono, A audífonos, L bloquear mouse.
  useEffect(() => {
    const onKeyDown = (event) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index < EMOTES.length) {
        sendEmote(EMOTES[index].id)
      }
      const key = event.key.toLowerCase()
      if (key === 'm') toggleMic()
      if (key === 'a') toggleDeafen()
      if (key === 'l') toggleMouseLock()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sendEmote, toggleMic, toggleDeafen, toggleMouseLock])

  const { iAmPlayer1, rivalName, myScore, rivalScore, iWon, finishDetail } =
    deriveHud(ui, user.userId)
  const canSurrender =
    connected && (ui.status === 'PLAYING' || ui.status === 'PAUSED')
  const graceLeft = graceLeftSeconds(ui, nowMs)
  // Sin micrófono (permiso negado) el botón M no tiene qué habilitar.
  const micAvailable =
    voiceUi.status !== 'no-mic' && voiceUi.status !== 'listen-only'
  const micLive = micAvailable && voiceUi.micOn && !settings.micIn.muted
  const showVoice = voiceUi.status && ui.status !== 'FINISHED'

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
          className={`game-ping ${pingClass(ping)}`}
          title="Latencia hacia el servidor"
        >
          · {ping ?? '— '}ms
        </span>
      </header>

      <div className="game-board-wrap">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          className="game-canvas"
        />

        <GameOverlays
          connected={connected}
          ui={ui}
          graceLeft={graceLeft}
          iWon={iWon}
          finishDetail={finishDetail}
          myScore={myScore}
          rivalScore={rivalScore}
          rivalName={rivalName}
          confirmSurrender={confirmSurrender}
          onSurrender={() => {
            connectionRef.current?.sendSurrender()
            setConfirmSurrender(false)
          }}
          onKeepPlaying={() => setConfirmSurrender(false)}
        />

        <EmoteBubbles bubbles={bubbles} />
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
        {showVoice && (
          <VoiceControls
            micAvailable={micAvailable}
            micLive={micLive}
            deafened={voiceUi.deafened}
            status={voiceUi.status}
            onToggleMic={toggleMic}
            onToggleDeafen={toggleDeafen}
          />
        )}
        <MouseLockButton locked={mouseLocked} onToggle={toggleMouseLock} />
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
        Con 🔒 (tecla L) el mouse queda bloqueado dentro del tablero; Esc lo suelta.
        Toca los poderes que aparecen en el tablero para activarlos: 🧱 obstáculo,
        ⚡ zona rápida, 🐌 zona lenta, 👻 disco fantasma, 🛡️ escudo y 💥 caos.
        {showVoice &&
          ' Chat de voz: M enciende tu micrófono y A silencia al rival.'}
      </p>
    </div>
  )
}

/**
 * Valores del HUD derivados del estado de la partida, vistos desde el lado
 * del jugador local (quién es el rival, marcador propio/ajeno, resultado).
 */
function deriveHud(ui, myUserId) {
  const iAmPlayer1 = !ui.player1UserId || ui.player1UserId === myUserId
  let rivalName
  if (ui.opponentType === 'BOT') {
    rivalName = ui.botLevel > 0 ? `Bot nivel ${ui.botLevel}` : 'BOT'
  } else {
    rivalName = (iAmPlayer1 ? ui.player2Username : ui.player1Username) ?? 'Rival'
  }
  const myScore = iAmPlayer1 ? ui.score1 : ui.score2
  const rivalScore = iAmPlayer1 ? ui.score2 : ui.score1
  const iWon = ui.winnerId ? ui.winnerId === myUserId : myScore > rivalScore
  return {
    iAmPlayer1,
    rivalName,
    myScore,
    rivalScore,
    iWon,
    finishDetail: finishDetailOf(ui.finishReason, iWon),
  }
}

/** Con forfeit el marcador no cuenta la historia: el motivo va aparte. */
function finishDetailOf(finishReason, iWon) {
  if (finishReason === 'SURRENDER') {
    return iWon ? 'Tu rival se rindió.' : 'Te rendiste.'
  }
  if (finishReason === 'DISCONNECT') {
    return iWon ? 'Tu rival abandonó la partida.' : 'Perdiste por abandono.'
  }
  return null
}

/** Segundos de gracia restantes durante la pausa; null fuera de ella. */
function graceLeftSeconds(ui, nowMs) {
  if (ui.status !== 'PAUSED' || !ui.graceDeadlineEpochMs || !nowMs) return null
  return Math.max(0, Math.ceil((ui.graceDeadlineEpochMs - nowMs) / 1000))
}

function pingClass(ping) {
  if (ping === null) return 'bad'
  if (ping < 80) return 'good'
  return ping < 150 ? 'mid' : 'bad'
}

/** Overlays sobre el tablero: conexión/espera, pausa, final y rendición. */
function GameOverlays({
  connected,
  ui,
  graceLeft,
  iWon,
  finishDetail,
  myScore,
  rivalScore,
  rivalName,
  confirmSurrender,
  onSurrender,
  onKeepPlaying,
}) {
  return (
    <>
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
          <Link to="/" className="game-back" onClick={() => playSfx('menuRetroceso')}>
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
              onClick={onSurrender}
            >
              Sí, rendirme
            </button>
            <button type="button" onClick={onKeepPlaying}>
              Seguir jugando
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function EmoteBubbles({ bubbles }) {
  return (
    <>
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
    </>
  )
}

/** Botones M/A del chat de voz con su estado traducido. */
function VoiceControls({
  micAvailable,
  micLive,
  deafened,
  status,
  onToggleMic,
  onToggleDeafen,
}) {
  let micTitle = 'Sin permiso de micrófono'
  if (micAvailable) {
    micTitle = micLive ? 'Micrófono encendido (M)' : 'Micrófono apagado (M)'
  }
  return (
    <>
      <button
        type="button"
        className={`voice-button ${micLive ? 'on' : 'off'}`}
        title={micTitle}
        onClick={onToggleMic}
        disabled={!micAvailable}
      >
        <span className="emote-icon">{micLive ? '🎙️' : '🚫'}</span>
        <span className="emote-key">M</span>
      </button>
      <button
        type="button"
        className={`voice-button ${deafened ? 'off' : 'on'}`}
        title={`Audífonos: ${deafened ? 'no escuchas al rival' : 'escuchas al rival'} (A)`}
        onClick={onToggleDeafen}
      >
        <span className="emote-icon">{deafened ? '🔇' : '🎧'}</span>
        <span className="emote-key">A</span>
      </button>
      <span className="voice-status">Voz: {VOICE_LABELS[status] ?? status}</span>
    </>
  )
}

function MouseLockButton({ locked, onToggle }) {
  return (
    <button
      type="button"
      className={`voice-button ${locked ? 'on' : 'off'}`}
      title={
        locked
          ? 'Mouse bloqueado en el tablero: Esc o L para soltarlo'
          : 'Bloquear el mouse dentro del tablero (L)'
      }
      onClick={onToggle}
    >
      <span className="emote-icon">{locked ? '🔒' : '🔓'}</span>
      <span className="emote-key">L</span>
    </button>
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

  // Disco. Con el fantasma activo solo aparece en los destellos que dejan
  // los rebotes, y semi-transparente: se intuye la dirección, nada más.
  if (state.puckVisible !== false) {
    const ghosting = (state.effects ?? []).some((e) => e.type === 'GHOST_PUCK')
    if (ghosting) ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.arc(state.puckX, state.puckY, PUCK_R, 0, Math.PI * 2)
    ctx.fillStyle = '#e0e0e0'
    ctx.shadowColor = '#e0e0e0'
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  drawPowerBadges(ctx, state)
  drawGoalBanner(ctx, state)
}

/**
 * Anuncio a mitad de cancha mientras el saque está retenido: quién anotó
 * (o "¡A jugar!" en el arranque). El servidor manda serveAtEpochMs y no
 * saca antes de eso, así que el banner y la pausa terminan a la vez.
 */
function drawGoalBanner(ctx, state) {
  if (!state.serveAtEpochMs || Date.now() >= state.serveAtEpochMs) return
  let scorer = null
  if (state.lastScorer === 1) scorer = state.player1
  else if (state.lastScorer === 2) scorer = state.player2
  const text = state.lastScorer ? `¡Gol de ${scorer?.username ?? 'BOT'}!` : '¡A jugar!'

  ctx.fillStyle = 'rgba(10, 10, 15, 0.65)'
  ctx.fillRect(0, BOARD_H / 2 - 46, BOARD_W, 92)
  ctx.font = 'bold 42px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd54a'
  ctx.fillText(text, BOARD_W / 2, BOARD_H / 2)
}

/**
 * El servidor no manda evento de colisión, así que el rebote se deduce del
 * cambio de dirección del disco entre tres estados seguidos: si la velocidad
 * en un eje se invierte, es que chocó con algo (pared, paleta u obstáculo).
 * Se descartan los saltos grandes (saque tras gol, que teletransporta el
 * disco) y los movimientos casi quietos, donde el ruido de la interpolación
 * invierte el signo sin que haya golpe.
 */
const REBOTE_V_MIN = 1.5 // px por tick; por debajo es ruido, no un golpe
const REBOTE_COOLDOWN_MS = 60 // dos golpes más juntos que esto son el mismo

let ultimoReboteMs = 0

function detectarRebote(prevPrev, prev, state) {
  if (!prevPrev) return false
  const vx0 = prev.puckX - prevPrev.puckX
  const vy0 = prev.puckY - prevPrev.puckY
  const vx1 = state.puckX - prev.puckX
  const vy1 = state.puckY - prev.puckY

  // Saque tras gol: el disco reaparece en el centro, no rebotó.
  if (Math.abs(vx1) > SNAP_DIST || Math.abs(vy1) > SNAP_DIST) return false

  const choqueX = vx0 * vx1 < 0 && Math.abs(vx0) > REBOTE_V_MIN && Math.abs(vx1) > REBOTE_V_MIN
  const choqueY = vy0 * vy1 < 0 && Math.abs(vy0) > REBOTE_V_MIN && Math.abs(vy1) > REBOTE_V_MIN
  if (!choqueX && !choqueY) return false

  const ahora = performance.now()
  if (ahora - ultimoReboteMs < REBOTE_COOLDOWN_MS) return false
  ultimoReboteMs = ahora
  return true
}

/**
 * Sonidos de partida por transición de estado (nuevo vs anterior): saque al
 * arrancar, gol (distinto según sea a favor o en contra), desenlace,
 * aparición/recogida de poderes y rebotes del disco. Sin estado anterior no
 * suena nada: reconectar a mitad de partida es silencio, no una ráfaga de
 * eventos viejos.
 */
function playStateSfx(prevPrev, prev, state, myUserId) {
  if (!prev) return
  if (state.status === 'PLAYING' && prev.status !== 'PLAYING') {
    playSfx('inicioPartida')
  }
  // Solo con el disco en juego: durante la pausa de gol sigue habiendo
  // estados, pero el disco está retenido y no debe sonar nada.
  if (state.status === 'PLAYING' && (!state.serveAtEpochMs || Date.now() >= state.serveAtEpochMs)) {
    if (detectarRebote(prevPrev, prev, state)) playRebote()
  }
  // El gol de la victoria llega ya FINISHED: ahí suena solo el desenlace,
  // porque encimarle el gol deja dos pistas peleándose el cierre.
  if (state.status === 'FINISHED' && prev.status !== 'FINISHED') {
    playSfx(state.winnerId === myUserId ? 'victoria' : 'derrota')
  } else if (state.score1 > prev.score1 || state.score2 > prev.score2) {
    const soyPlayer1 = state.player1?.userId === myUserId
    const anotoPlayer1 = state.score1 > prev.score1
    playSfx(anotoPlayer1 === soyPlayer1 ? 'golFavor' : 'golContra')
  }
  // El saque suena cuando el disco se suelta, no cuando arranca la pausa:
  // si no, se encimaría con el sonido del gol que acaba de entrar.
  if (state.lastScorer && state.serveAtEpochMs && state.serveAtEpochMs !== prev.serveAtEpochMs) {
    setTimeout(() => playSfx('saque'), Math.max(0, state.serveAtEpochMs - Date.now()))
  }
  if (state.pickup && !prev.pickup) playSfx('poderAparece')
  const prevTypes = new Set((prev.effects ?? []).map((e) => e.type))
  for (const effect of state.effects ?? []) {
    if (prevTypes.has(effect.type)) continue
    const sfx = POWER_SFX[effect.type]
    if (sfx) playSfx(sfx)
  }
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
  // Del listado de efectos y no de puckVisible: el badge no debe parpadear
  // con cada destello del disco.
  if ((state.effects ?? []).some((e) => e.type === 'GHOST_PUCK')) {
    badges.push('👻 Disco fantasma: se asoma en los rebotes')
  }
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
