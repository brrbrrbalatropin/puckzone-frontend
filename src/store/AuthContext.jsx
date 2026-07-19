import { useCallback, useMemo, useState } from 'react'
import { AuthContext } from './auth-context'
import { decodeJwt } from '../services/jwt'

/**
 * Estado global de sesion: token JWT + datos del usuario.
 * Se persiste en localStorage para sobrevivir recargas de pagina.
 * El userId sale del claim `sub` del token; username/university vienen
 * en la respuesta de auth (y tambien como claims, por redundancia).
 */
function loadStoredSession() {
  const token = localStorage.getItem('puckzone_token')
  const rawUser = localStorage.getItem('puckzone_user')
  if (!token || !rawUser) return { token: null, user: null }
  try {
    return { token, user: JSON.parse(rawUser) }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadStoredSession)

  // authResponse = { token, refreshToken, username, university } de register o login.
  // El refresh token solo lo consume el interceptor de api.js cuando el
  // access (1h) vence; por eso no hace falta tenerlo en el estado de React.
  const login = useCallback((authResponse) => {
    const claims = decodeJwt(authResponse.token) || {}
    const user = {
      userId: claims.sub,
      username: authResponse.username,
      university: authResponse.university,
      email: claims.email,
    }
    localStorage.setItem('puckzone_token', authResponse.token)
    localStorage.setItem('puckzone_refresh_token', authResponse.refreshToken)
    localStorage.setItem('puckzone_user', JSON.stringify(user))
    setSession({ token: authResponse.token, user })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('puckzone_token')
    localStorage.removeItem('puckzone_refresh_token')
    localStorage.removeItem('puckzone_user')
    setSession({ token: null, user: null })
  }, [])

  // Memoizado: un objeto nuevo en cada render re-renderizaría a TODOS los
  // consumidores del contexto aunque la sesión no haya cambiado.
  const value = useMemo(
    () => ({
      token: session.token,
      user: session.user,
      isAuthenticated: Boolean(session.token),
      login,
      logout,
    }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
