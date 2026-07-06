/**
 * Decodifica el payload de un JWT sin verificar la firma (eso es trabajo
 * del gateway). Se usa para extraer el userId (claim `sub`) y demas claims,
 * porque la respuesta de auth no incluye el userId.
 */
export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}
