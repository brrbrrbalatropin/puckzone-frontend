import { useCallback, useEffect, useRef, useState } from 'react'
import Header from '../../components/Header'
import { useAuth } from '../../hooks/useAuth'
import { createChatConnection } from '../../services/chatSocket'
import {
  acceptFriendRequest,
  deleteFriendship,
  getDirectMessages,
  getFriendsOverview,
  sendFriendRequest,
} from '../../services/friendsService'
import { getPlayer } from '../../services/rankingService'
import { userColor, userInitial } from '../../utils/userColor'

const MAX_LENGTH = 200
const SEND_COOLDOWN_MS = 500
// La presencia (punto verde) y las solicitudes entran por REST: refresco suave.
const OVERVIEW_POLL_MS = 15000

const EMPTY_OVERVIEW = { friends: [], incoming: [], outgoing: [] }

function formatTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function Avatar({ userId, username, size = 34 }) {
  return (
    <span
      className="chat-avatar"
      style={{ background: userColor(userId), width: size, height: size, fontSize: size * 0.45 }}
    >
      {userInitial(username)}
    </span>
  )
}

/**
 * Pestaña de chat estilo Discord: canales y amigos a la izquierda, la
 * conversación activa al centro y el perfil del interlocutor a la derecha.
 * Un solo WS para los tres canales; los DMs persisten en el servidor y
 * el historial de cada amigo se carga por REST al abrir su conversación.
 * Cada usuario se pinta con el color derivado de su userId (sin fotos,
 * el color es la cara).
 */
export default function Chat() {
  const { user } = useAuth()

  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [connected, setConnected] = useState(false)
  // Conversación activa: {type: 'global'|'university'} o {type:'dm', friend}
  const [active, setActive] = useState({ type: 'global' })
  const [globalMessages, setGlobalMessages] = useState([])
  const [uniMessages, setUniMessages] = useState([])
  // Hilos de DM por userId del amigo; se cargan perezosos al abrir.
  const [dmThreads, setDmThreads] = useState({})
  const [unread, setUnread] = useState({})

  const [draft, setDraft] = useState('')
  const [coolingDown, setCoolingDown] = useState(false)
  const [addName, setAddName] = useState('')
  const [addFeedback, setAddFeedback] = useState(null) // {ok, text}

  // Perfil del panel derecho (solo en DMs): datos de ranking del amigo.
  const [profile, setProfile] = useState(null)
  const [profileMissing, setProfileMissing] = useState(false)

  const connection = useRef(null)
  const scrollRef = useRef(null)
  // La conversación activa, visible desde los callbacks del socket.
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  const refreshOverview = useCallback(() => {
    // Si falla es transitorio: el próximo poll lo intenta de nuevo.
    getFriendsOverview().then(setOverview).catch(() => {})
  }, [])

  useEffect(() => {
    refreshOverview()
    const interval = setInterval(refreshOverview, OVERVIEW_POLL_MS)
    return () => clearInterval(interval)
  }, [refreshOverview])

  useEffect(() => {
    connection.current = createChatConnection({
      token: localStorage.getItem('puckzone_token'),
      university: user.university,
      onGlobalHistory: setGlobalMessages,
      onGlobalMessage: (msg) => setGlobalMessages((prev) => [...prev, msg]),
      onUniversityHistory: setUniMessages,
      onUniversityMessage: (msg) => setUniMessages((prev) => [...prev, msg]),
      onDirectMessage: (dm) => {
        const other = dm.senderId === user.userId ? dm.recipientId : dm.senderId
        setDmThreads((prev) => ({ ...prev, [other]: [...(prev[other] || []), dm] }))
        const current = activeRef.current
        const isOpen = current.type === 'dm' && current.friend.userId === other
        if (!isOpen && dm.senderId !== user.userId) {
          setUnread((prev) => ({ ...prev, [other]: (prev[other] || 0) + 1 }))
        }
      },
      onConnectionChange: setConnected,
    })
    return () => connection.current?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDm = async (friend) => {
    setActive({ type: 'dm', friend })
    setUnread((prev) => ({ ...prev, [friend.userId]: 0 }))
    // El panel derecho no debe mostrar el perfil del amigo anterior.
    setProfile(null)
    setProfileMissing(false)
    // El historial persistido solo hace falta la primera vez.
    if (!dmThreads[friend.userId]) {
      try {
        const history = await getDirectMessages(friend.userId)
        setDmThreads((prev) => ({ ...prev, [friend.userId]: history }))
      } catch {
        /* si falla, el hilo arranca vacío y los mensajes en vivo entran igual */
      }
    }
  }

  // Perfil del interlocutor al abrir un DM (404 = aún no juega partidas).
  // El reset al cambiar de conversación lo hace openDm, no este effect.
  useEffect(() => {
    if (active.type !== 'dm') return undefined
    let cancelled = false
    getPlayer(active.friend.userId)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch(() => {
        if (!cancelled) setProfileMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [active])

  // Mensajes de la conversación activa, normalizados para pintarlos igual.
  const activeMessages = (() => {
    if (active.type === 'global') {
      return globalMessages.map((m) => ({ ...m, key: `${m.sentAtEpochMs}-${m.userId}` }))
    }
    if (active.type === 'university') {
      return uniMessages.map((m) => ({ ...m, key: `${m.sentAtEpochMs}-${m.userId}` }))
    }
    return (dmThreads[active.friend.userId] || []).map((dm) => ({
      key: dm.id,
      userId: dm.senderId,
      username: dm.senderId === user.userId ? user.username : active.friend.username,
      text: dm.content,
      sentAtEpochMs: dm.sentAtEpochMs,
    }))
  })()

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeMessages.length, active])

  const handleSend = (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || coolingDown || !connected) return
    if (active.type === 'global') connection.current?.sendGlobal(text)
    if (active.type === 'university') connection.current?.sendUniversity(text)
    if (active.type === 'dm') connection.current?.sendDirect(active.friend.userId, text)
    setDraft('')
    setCoolingDown(true)
    setTimeout(() => setCoolingDown(false), SEND_COOLDOWN_MS)
  }

  const handleAddFriend = async (e) => {
    e.preventDefault()
    const username = addName.trim()
    if (!username) return
    try {
      await sendFriendRequest(username)
      setAddFeedback({ ok: true, text: `Solicitud enviada a ${username}` })
      setAddName('')
      refreshOverview()
    } catch (err) {
      setAddFeedback({
        ok: false,
        text: err.response?.data?.error || 'No se pudo enviar la solicitud',
      })
    }
  }

  const handleAccept = async (request) => {
    try {
      await acceptFriendRequest(request.friendshipId)
      refreshOverview()
    } catch {
      refreshOverview()
    }
  }

  const handleDelete = async (friendshipId) => {
    try {
      await deleteFriendship(friendshipId)
    } finally {
      refreshOverview()
    }
  }

  const removeFriend = async (friend) => {
    if (!window.confirm(`¿Eliminar a ${friend.username} de tus amigos?`)) return
    await handleDelete(friend.friendshipId)
    if (active.type === 'dm' && active.friend.userId === friend.userId) {
      setActive({ type: 'global' })
    }
  }

  const conversationTitle =
    active.type === 'global'
      ? '💬 Global'
      : active.type === 'university'
        ? `🎓 ${user.university}`
        : `@${active.friend.username}`

  return (
    <div className="app-page">
      <Header />

      <main className="chatpage-main">
        {/* ── Izquierda: canales, solicitudes y amigos ── */}
        <aside className="chatpage-sidebar">
          <h4 className="chatpage-section">Canales</h4>
          <button
            type="button"
            className={`chatpage-item${active.type === 'global' ? ' active' : ''}`}
            onClick={() => setActive({ type: 'global' })}
          >
            <span className="chatpage-channel-icon">💬</span> Global
          </button>
          <button
            type="button"
            className={`chatpage-item${active.type === 'university' ? ' active' : ''}`}
            onClick={() => setActive({ type: 'university' })}
          >
            <span className="chatpage-channel-icon">🎓</span> {user.university}
          </button>

          {overview.incoming.length > 0 && (
            <>
              <h4 className="chatpage-section">Solicitudes</h4>
              {overview.incoming.map((req) => (
                <div key={req.friendshipId} className="chatpage-item chatpage-request">
                  <Avatar userId={req.userId} username={req.username} size={28} />
                  <span className="chatpage-name">{req.username}</span>
                  <span className="chatpage-actions">
                    <button type="button" title="Aceptar" onClick={() => handleAccept(req)}>
                      ✓
                    </button>
                    <button type="button" title="Rechazar" onClick={() => handleDelete(req.friendshipId)}>
                      ✗
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}

          <h4 className="chatpage-section">Amigos — {overview.friends.length}</h4>
          {overview.friends.length === 0 && (
            <p className="chatpage-hint">Agrega amigos con su username aquí abajo.</p>
          )}
          {overview.friends.map((friend) => (
            <button
              key={friend.friendshipId}
              type="button"
              className={`chatpage-item${
                active.type === 'dm' && active.friend.userId === friend.userId ? ' active' : ''
              }`}
              onClick={() => openDm(friend)}
            >
              <span className="chatpage-avatar-wrap">
                <Avatar userId={friend.userId} username={friend.username} size={28} />
                <span className={`presence-dot${friend.online ? ' on' : ''}`} />
              </span>
              <span className="chatpage-name">{friend.username}</span>
              {unread[friend.userId] > 0 && (
                <span className="chatpage-unread">{unread[friend.userId]}</span>
              )}
            </button>
          ))}

          {overview.outgoing.length > 0 && (
            <>
              <h4 className="chatpage-section">Enviadas</h4>
              {overview.outgoing.map((req) => (
                <div key={req.friendshipId} className="chatpage-item chatpage-request">
                  <Avatar userId={req.userId} username={req.username} size={28} />
                  <span className="chatpage-name pending">{req.username}</span>
                  <span className="chatpage-actions">
                    <button type="button" title="Cancelar" onClick={() => handleDelete(req.friendshipId)}>
                      ✗
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}

          <form className="chatpage-add" onSubmit={handleAddFriend}>
            <input
              type="text"
              value={addName}
              placeholder="Agregar por username…"
              onChange={(e) => {
                setAddName(e.target.value)
                setAddFeedback(null)
              }}
            />
            <button type="submit" disabled={!addName.trim()}>
              +
            </button>
          </form>
          {addFeedback && (
            <p className={`chatpage-feedback${addFeedback.ok ? ' ok' : ''}`}>{addFeedback.text}</p>
          )}
        </aside>

        {/* ── Centro: la conversación activa ── */}
        <section className="chatpage-conversation">
          <div className="chatpage-conv-header">
            <strong>{conversationTitle}</strong>
            <span
              className={`chat-status ${connected ? 'on' : 'off'}`}
              title={connected ? 'Conectado' : 'Conectando…'}
            />
          </div>

          <div className="chatpage-messages" ref={scrollRef}>
            {activeMessages.length === 0 && (
              <p className="chat-empty">
                {connected
                  ? active.type === 'dm'
                    ? `Este es el comienzo de tu conversación con ${active.friend.username}.`
                    : 'Nadie ha dicho nada todavía. ¡Rompe el hielo!'
                  : 'Conectando al chat…'}
              </p>
            )}
            {activeMessages.map((msg) => (
              <div key={msg.key} className="chatpage-msg">
                <Avatar userId={msg.userId} username={msg.username} />
                <div className="chatpage-msg-body">
                  <span className="chat-meta">
                    <strong className="chat-author" style={{ color: userColor(msg.userId) }}>
                      {msg.userId === user.userId ? 'Tú' : msg.username}
                    </strong>
                    {msg.university && active.type === 'global' && (
                      <small className="chat-uni">({msg.university})</small>
                    )}
                    <small className="chat-time">{formatTime(msg.sentAtEpochMs)}</small>
                  </span>
                  <span className="chat-text">{msg.text}</span>
                </div>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleSend}>
            <input
              type="text"
              value={draft}
              maxLength={MAX_LENGTH}
              placeholder={
                active.type === 'dm'
                  ? `Enviar mensaje a @${active.friend.username}`
                  : `Escribir en ${conversationTitle}…`
              }
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={!connected || coolingDown || !draft.trim()}>
              ➤
            </button>
          </form>
        </section>

        {/* ── Derecha: perfil del interlocutor o descripción del canal ── */}
        <aside className="chatpage-profile">
          {active.type === 'dm' ? (
            <>
              <div
                className="chatpage-profile-banner"
                style={{ background: userColor(active.friend.userId) }}
              />
              <Avatar userId={active.friend.userId} username={active.friend.username} size={72} />
              <h3>{active.friend.username}</h3>
              <p className="chatpage-profile-uni">🎓 {active.friend.university || '—'}</p>
              <p className={`chatpage-profile-presence${active.friend.online ? ' on' : ''}`}>
                {active.friend.online ? '● En línea' : '○ Desconectado'}
              </p>

              {profile && (
                <dl className="chatpage-stats">
                  <div>
                    <dt>ELO</dt>
                    <dd>{profile.elo}</dd>
                  </div>
                  <div>
                    <dt>Posición</dt>
                    <dd>{profile.position ? `#${profile.position}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Victorias</dt>
                    <dd>{profile.wins}</dd>
                  </div>
                  <div>
                    <dt>Derrotas</dt>
                    <dd>{profile.losses}</dd>
                  </div>
                </dl>
              )}
              {profileMissing && (
                <p className="chatpage-hint">Todavía no juega partidas clasificatorias.</p>
              )}

              <button
                type="button"
                className="chatpage-remove"
                onClick={() => removeFriend(active.friend)}
              >
                Eliminar amigo
              </button>
            </>
          ) : (
            <>
              <div className="chatpage-profile-banner neutral" />
              <h3>{conversationTitle}</h3>
              <p className="chatpage-hint">
                {active.type === 'global'
                  ? 'Canal abierto para todos los jugadores de PuckZone.'
                  : `Canal exclusivo de ${user.university}: solo ustedes pueden leerlo y escribirlo.`}
              </p>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
