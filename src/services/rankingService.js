import api from './api'

/**
 * Consultas al servicio de ranking (via gateway).
 * Un jugador sin partidas todavia no existe en ranking: el GET devuelve 404.
 */

// {position, id, username, university, elo, wins, losses}
export async function getPlayer(userId) {
  const { data } = await api.get(`/api/ranking/player/${userId}`)
  return data
}

// [{position, id, username, university, elo, wins, losses}] (top N, default 50)
export async function getGlobalRanking(limit) {
  const { data } = await api.get('/api/ranking/global', { params: { limit } })
  return data
}

// [{position, university, totalElo, playerCount}] — ELO sumado por universidad
export async function getUniversityRanking() {
  const { data } = await api.get('/api/ranking/university')
  return data
}

// [{matchId, opponentUsername, vsBot, won, myScore, rivalScore, eloChange, playedAt}]
// Las partidas vs bot vienen con eloChange 0 (no afectan ELO ni V-D).
export async function getPlayerMatches(userId, limit = 20) {
  const { data } = await api.get(`/api/ranking/player/${userId}/matches`, { params: { limit } })
  return data
}
