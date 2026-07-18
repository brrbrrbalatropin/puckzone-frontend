import api from './api'

/**
 * Llamadas REST al servicio de game (vía gateway, /api/game). El juego en
 * sí corre por WebSocket (gameSocket.js); esto es solo lo que se consulta
 * fuera de la partida.
 */

// ¿Tengo una partida viva a la cual volver? (p. ej. cerré la pestaña a
// mitad de partida). 200 {gameId, shard, status, opponentType,
// opponentUsername, myScore, opponentScore, graceDeadlineEpochMs} | 204
// sin partida (null). shard: a qué /ws-{shard} reconectarse.
export async function getActiveGame() {
  const response = await api.get('/api/game/active')
  return response.status === 204 ? null : response.data
}
