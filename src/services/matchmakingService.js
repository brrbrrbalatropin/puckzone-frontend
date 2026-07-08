import api from './api'

/**
 * Llamadas al servicio de matchmaking (via gateway, /api/matching).
 * El JWT identifica al jugador: ninguna llamada lleva body.
 * Ojo: el gateway reescribe /api/matching${resto} -> /queue${resto}, asi que
 * el "queue" NO va en el path publico (/api/matching/queue seria /queue/queue).
 */

// 201 {status:"WAITING", secondsWaiting:0} | 409 si ya estaba en cola
export async function joinQueue() {
  const { data } = await api.post('/api/matching')
  return data
}

// {status:"MATCHED"|"WAITING"|"NOT_IN_QUEUE", secondsWaiting?, match?:
//  {matchId, opponentType:"HUMAN"|"BOT", opponentUsername, opponentUniversity}}
export async function getQueueStatus() {
  const { data } = await api.get('/api/matching/status')
  return data
}

// 204, idempotente
export async function leaveQueue() {
  await api.delete('/api/matching')
}

// Acepta la oferta de jugar vs bot (tras el timeout): 201 {status:"MATCHED", match}
// 409 si ya no estaba en cola (p. ej. justo lo emparejó un humano y expiró la sala)
export async function playBot() {
  const { data } = await api.post('/api/matching/bot')
  return data
}
