import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { API_URL } from './api'

/**
 * Conexión STOMP sobre SockJS a la partida, vía gateway.
 * El JWT va en ?token= porque SockJS no puede mandar headers en el
 * handshake; el gateway lo valida y hace proxy a game.
 *
 * Al conectar (y en cada reconexión automática) se suscribe al topic de la
 * partida y publica el join. El servidor es autoritativo: aquí solo se
 * envían inputs y se recibe el GameState que pinta el canvas.
 */
export function createGameConnection({ gameId, userId, token, onState, onEmote, onConnectionChange }) {
  // El token se lee de localStorage EN CADA intento de conexión: si el
  // interceptor de api.js refrescó la sesión, el estado de React (el
  // parámetro `token`) puede traer el access viejo ya vencido.
  const currentToken = () => localStorage.getItem('puckzone_token') || token
  const client = new Client({
    webSocketFactory: () => new SockJS(`${API_URL}/ws?token=${encodeURIComponent(currentToken())}`),
    reconnectDelay: 2000,

    onConnect: () => {
      client.subscribe(`/topic/game/${gameId}`, (frame) => {
        onState(JSON.parse(frame.body))
      })
      client.subscribe(`/topic/game/${gameId}/emotes`, (frame) => {
        onEmote?.(JSON.parse(frame.body))
      })
      client.publish({
        destination: `/app/game/${gameId}/join`,
        body: JSON.stringify({ userId }),
      })
      onConnectionChange?.(true)
    },

    onWebSocketClose: () => {
      onConnectionChange?.(false)
    },
  })

  client.activate()

  return {
    /** Coordenadas de mouse en píxeles del tablero; el servidor las recorta. */
    sendPaddle(x, y) {
      if (!client.connected) return
      client.publish({
        destination: `/app/game/${gameId}/paddle`,
        body: JSON.stringify({ userId, x, y }),
      })
    },

    /**
     * Rendición YA confirmada por el usuario (el "¿estás seguro?" es de la
     * UI): el servidor cierra la partida a favor del rival de inmediato.
     */
    sendSurrender() {
      if (!client.connected) return
      client.publish({
        destination: `/app/game/${gameId}/surrender`,
        body: '{}',
      })
    },

    /** Id de emote de la lista blanca del servidor (THUMBS_UP, LAUGH, ...). */
    sendEmote(emote) {
      if (!client.connected) return
      client.publish({
        destination: `/app/game/${gameId}/emote`,
        body: JSON.stringify({ userId, emote }),
      })
    },

    disconnect() {
      client.deactivate()
    },
  }
}
