import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { API_URL } from './api'

/**
 * Conexión STOMP de la pestaña de chat: los tres canales por la misma
 * conexión (mismo esquema de lobbySocket, JWT releído de localStorage en
 * cada intento).
 *
 * - Global: /app/lobby/chat → /topic/lobby/chat (+ history al suscribirse).
 * - Universidad: /app/lobby/chat/university → /topic/lobby/chat/university/{uni}.
 *   El servidor decide la universidad por el JWT y bloquea el SUBSCRIBE a
 *   canales ajenos; aquí solo se arma el nombre del topic propio.
 * - Mensajes directos: /app/dm {toUserId, text} → cola personal
 *   /user/queue/dm. Llega CADA DM del usuario (enviado o recibido, incluso
 *   el eco de lo que él mismo mandó): el que llame decide en qué
 *   conversación pintarlo.
 */
export function createChatConnection({
  token,
  university,
  onGlobalHistory,
  onGlobalMessage,
  onUniversityHistory,
  onUniversityMessage,
  onDirectMessage,
  onConnectionChange,
}) {
  const currentToken = () => localStorage.getItem('puckzone_token') || token
  const client = new Client({
    webSocketFactory: () => new SockJS(`${API_URL}/ws?token=${encodeURIComponent(currentToken())}`),
    reconnectDelay: 2000,

    onConnect: () => {
      client.subscribe('/app/lobby/chat/history', (frame) => {
        onGlobalHistory(JSON.parse(frame.body))
      })
      client.subscribe('/topic/lobby/chat', (frame) => {
        onGlobalMessage(JSON.parse(frame.body))
      })
      if (university) {
        client.subscribe('/app/lobby/chat/university/history', (frame) => {
          onUniversityHistory(JSON.parse(frame.body))
        })
        client.subscribe(`/topic/lobby/chat/university/${university}`, (frame) => {
          onUniversityMessage(JSON.parse(frame.body))
        })
      }
      client.subscribe('/user/queue/dm', (frame) => {
        onDirectMessage(JSON.parse(frame.body))
      })
      onConnectionChange?.(true)
    },

    onWebSocketClose: () => {
      onConnectionChange?.(false)
    },
  })

  client.activate()

  const publish = (destination, body) => {
    if (!client.connected) return
    client.publish({ destination, body: JSON.stringify(body) })
  }

  return {
    sendGlobal(text) {
      publish('/app/lobby/chat', { text })
    },
    sendUniversity(text) {
      publish('/app/lobby/chat/university', { text })
    },
    sendDirect(toUserId, text) {
      publish('/app/dm', { toUserId, text })
    },
    disconnect() {
      client.deactivate()
    },
  }
}
