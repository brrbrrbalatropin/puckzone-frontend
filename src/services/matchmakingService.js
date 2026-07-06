import api from './api'

/**
 * Llamadas al servicio de matchmaking (via gateway, /api/matching).
 * El JWT identifica al jugador: ninguna llamada lleva body.
 */

// 201 {status:"WAITING", secondsWaiting:0} | 409 si ya estaba en cola
export async function joinQueue() {
  const { data } = await api.post('/api/matching/queue')
  return data
}

// {status:"MATCHED"|"WAITING"|"NOT_IN_QUEUE", secondsWaiting?, match?:
//  {matchId, opponentType:"HUMAN"|"BOT", opponentUsername, opponentUniversity}}
export async function getQueueStatus() {
  const { data } = await api.get('/api/matching/queue/status')
  return data
}

// 204, idempotente
export async function leaveQueue() {
  await api.delete('/api/matching/queue')
}
