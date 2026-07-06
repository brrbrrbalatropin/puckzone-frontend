import api from './api'

/**
 * Llamadas al servicio de autenticacion (via gateway).
 * Ambas devuelven { token, username, university }.
 */
export async function register({ username, email, password }) {
  const { data } = await api.post('/api/auth/register', { username, email, password })
  return data
}

export async function login({ email, password }) {
  const { data } = await api.post('/api/auth/login', { email, password })
  return data
}
