import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { API_URL } from './api'

/**
 * Conexión STOMP del lobby (chat global), vía gateway, con el mismo
 * esquema de gameSocket: JWT en ?token= releído de localStorage en cada
 * intento por si el interceptor refrescó la sesión.
 *
 * Al conectar (y en cada reconexión automática) se suscribe primero a
 * /app/lobby/chat/history — el servidor responde UNA vez, solo a esta
 * sesión, con los últimos mensajes — y luego al topic en vivo. El servidor
 * firma cada mensaje con la identidad del JWT: aquí solo se manda el texto.
 */
export function createLobbyConnection({ token, onHistory, onMessage, onConnectionChange }) {
  const currentToken = () => localStorage.getItem('puckzone_token') || token
  const client = new Client({
    webSocketFactory: () => new SockJS(`${API_URL}/ws?token=${encodeURIComponent(currentToken())}`),
    reconnectDelay: 2000,

    onConnect: () => {
      client.subscribe('/app/lobby/chat/history', (frame) => {
        onHistory(JSON.parse(frame.body))
      })
      client.subscribe('/topic/lobby/chat', (frame) => {
        onMessage(JSON.parse(frame.body))
      })
      onConnectionChange?.(true)
    },

    onWebSocketClose: () => {
      onConnectionChange?.(false)
    },
  })

  client.activate()

  return {
    /** Texto plano; el servidor recorta, valida y aplica su cooldown. */
    sendChat(text) {
      if (!client.connected) return
      client.publish({
        destination: '/app/lobby/chat',
        body: JSON.stringify({ text }),
      })
    },

    disconnect() {
      client.deactivate()
    },
  }
}
