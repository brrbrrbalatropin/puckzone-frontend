import api from './api'

/**
 * Sistema de amigos (vive en game, via gateway). El backend identifica al
 * usuario por el Bearer token; aquí nunca se manda el propio userId.
 * Los errores de negocio llegan como {error: "mensaje"} con su status
 * (404 username desconocido, 409 duplicada/ya amigos, 403 sin permiso).
 */

// {friends: [{friendshipId,userId,username,university,online,lastSeenAtEpochMs}],
//  incoming: [{friendshipId,userId,username,university,createdAtEpochMs}], outgoing: [...]}
export async function getFriendsOverview() {
  const { data } = await api.get('/api/game/friends')
  return data
}

export async function sendFriendRequest(username) {
  const { data } = await api.post('/api/game/friends/requests', { username })
  return data
}

export async function acceptFriendRequest(friendshipId) {
  const { data } = await api.post(`/api/game/friends/requests/${friendshipId}/accept`)
  return data
}

// Rechazar, cancelar o eliminar amigo: la misma operación para el backend.
export async function deleteFriendship(friendshipId) {
  await api.delete(`/api/game/friends/${friendshipId}`)
}

// Últimos 50 mensajes con ese amigo, en orden cronológico.
// [{id, senderId, recipientId, content, sentAtEpochMs}]
export async function getDirectMessages(friendUserId) {
  const { data } = await api.get(`/api/game/friends/${friendUserId}/messages`)
  return data
}
