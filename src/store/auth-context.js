import { createContext } from 'react'

// Contexto de sesion; el valor lo provee <AuthProvider> (AuthContext.jsx)
// y se consume via el hook useAuth (hooks/useAuth.js).
export const AuthContext = createContext(null)
