/**
 * Identidad visual sin fotos de perfil: a cada usuario se le "bytecodea"
 * su userId (UUID estable) con un hash simple hacia un tono HSL. El mismo
 * usuario da SIEMPRE el mismo color, en cualquier pantalla y sesión;
 * saturación y luz fijas mantienen todo legible sobre fondo oscuro.
 */
export function userColor(userId) {
  let hash = 0
  const id = userId || ''
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 70%, 55%)`
}

/** La letra del avatar: inicial del username en mayúscula. */
export function userInitial(username) {
  return (username || '?').charAt(0).toUpperCase()
}
