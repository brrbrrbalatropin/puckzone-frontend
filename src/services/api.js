import axios from 'axios'

// El trafico completo del frontend pasa por el gateway; nunca se llama
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

// Refresh compartido: si varios requests reciben 401 a la vez (el lobby y la
// sala de espera pollean), solo se dispara UN POST /refresh y todos esperan
// el mismo resultado. Va con axios pelado (no `api`) para no recursar los
// interceptores de esta instancia.
let refreshPromise = null

function refreshSession() {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('puckzone_refresh_token')
    if (!refreshToken) {
      return Promise.reject(new Error('sin refresh token'))
    }
    refreshPromise = axios
      .post(`${API_URL}/api/auth/refresh`, { refreshToken }, { timeout: 10000 })
      .then(({ data }) => {
        localStorage.setItem('puckzone_token', data.token)
        localStorage.setItem('puckzone_refresh_token', data.refreshToken)
        return data.token
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function endSession() {
  localStorage.removeItem('puckzone_token')
  localStorage.removeItem('puckzone_refresh_token')
  localStorage.removeItem('puckzone_user')
  window.location.href = '/login'
}

// 401 en ruta protegida = access token vencido (dura 1h): se renueva con el
// refresh token y se reintenta la peticion original una sola vez (_retry
// evita bucles). Solo si el refresh tambien falla se limpia la sesion y se
// vuelve al login. Se excluyen los endpoints de auth: ahi el 401 es
// "credenciales malas" y lo maneja la propia pantalla.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    if (status !== 401 || url.startsWith('/api/auth/')) {
      throw error
    }
    if (error.config._retry) {
      endSession()
      throw error
    }
    error.config._retry = true
    try {
      await refreshSession()
      return api.request(error.config)
    } catch {
      endSession()
      throw error
    }
  },
)

export default api
