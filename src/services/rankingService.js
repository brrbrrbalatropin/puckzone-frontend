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
