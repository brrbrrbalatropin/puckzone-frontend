import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { createLobbyConnection } from '../services/lobbySocket'
import { userColor } from '../utils/userColor'

const MAX_LENGTH = 200
// El servidor descarta en silencio mensajes a <500ms del anterior; el botón
// se bloquea ese mismo lapso para que ninguno se pierda.
const SEND_COOLDOWN_MS = 500

function formatTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Panel de chat del lobby: desplegable de canal (solo Global por ahora;
 * los chats por sala/amigos llegan después), mensajes en vivo por STOMP y
 * respuesta rápida abajo. El servidor firma cada mensaje con el JWT, así
 * que aquí solo se pinta lo que llega.
 */
export default function LobbyChat() {
  const { user, token } = useAuth()

  const [messages, setMessages] = useState([])
  const [connected, setConnected] = useState(false)
  const [draft, setDraft] = useState('')
  const [coolingDown, setCoolingDown] = useState(false)

  const connection = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    connection.current = createLobbyConnection({
      token,
      onHistory: (history) => setMessages(history),
      onMessage: (message) => setMessages((prev) => [...prev, message]),
      onConnectionChange: setConnected,
    })
    return () => connection.current?.disconnect()
    // token: la conexión relee localStorage en cada intento; no se recrea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pegado abajo al llegar mensajes, como cualquier chat.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSend = (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || coolingDown || !connected) return
    connection.current?.sendChat(text)
    setDraft('')
    setCoolingDown(true)
    setTimeout(() => setCoolingDown(false), SEND_COOLDOWN_MS)
  }

  return (
    <section className="lobby-chat">
      <div className="chat-header">
        <select className="chat-channel" defaultValue="global" aria-label="Canal de chat">
          <option value="global">💬 Global</option>
        </select>
        <span
          className={`chat-status ${connected ? 'on' : 'off'}`}
          title={connected ? 'Conectado' : 'Conectando…'}
        />
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat-empty">
            {connected ? 'Nadie ha dicho nada todavía. ¡Rompe el hielo!' : 'Conectando al chat…'}
          </p>
        )}
        {messages.map((msg, i) => {
          const mine = msg.userId === user.userId
          return (
            <div key={`${msg.sentAtEpochMs}-${i}`} className={`chat-msg${mine ? ' mine' : ''}`}>
              <span className="chat-meta">
                <strong className="chat-author" style={{ color: userColor(msg.userId) }}>
                  {mine ? 'Tú' : msg.username}
                </strong>
                {msg.university && <small className="chat-uni">({msg.university})</small>}
                <small className="chat-time">{formatTime(msg.sentAtEpochMs)}</small>
              </span>
              <span className="chat-text">{msg.text}</span>
            </div>
          )
        })}
      </div>

      <form className="chat-form" onSubmit={handleSend}>
        <input
          type="text"
          value={draft}
          maxLength={MAX_LENGTH}
          placeholder="Escribe aquí…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!connected || coolingDown || !draft.trim()}>
          ➤
        </button>
      </form>
    </section>
  )
}
