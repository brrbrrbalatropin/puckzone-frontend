import axios from 'axios'

// Todo el trafico del frontend pasa por el gateway; nunca se llama
// directamente a un microservicio.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

// Agrega el JWT a cada request si hay sesion activa.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('puckzone_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Si el gateway responde 401 (token vencido o invalido) se limpia la sesion
// y se vuelve al login. Se excluyen los endpoints de auth: ahi el 401 es
// "credenciales malas" y lo maneja la propia pantalla.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    if (status === 401 && !url.startsWith('/api/auth/')) {
      localStorage.removeItem('puckzone_token')
      localStorage.removeItem('puckzone_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
