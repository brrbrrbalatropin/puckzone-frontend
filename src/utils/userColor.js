/**
 * Identidad visual sin fotos de perfil: a cada usuario se le "bytecodea"
 * su userId (UUID estable) con un hash simple hacia un tono HSL. El mismo
 * usuario da SIEMPRE el mismo color, en cualquier pantalla y sesión;
 * saturación y luz fijas mantienen cada avatar legible sobre fondo oscuro.
 */
export function userColor(userId = '') {
  let hue = 0
  if (typeof userId === 'string') {
    // Módulo en cada paso: el acumulado nunca desborda y el resultado ya es el tono.
    for (let i = 0; i < userId.length; i++) {
      hue = (hue * 31 + userId.codePointAt(i)) % 360
    }
  }
  return `hsl(${hue}, 70%, 55%)`
}

/** La letra del avatar: inicial del username en mayúscula. */
export function userInitial(username) {
  return (username || '?').charAt(0).toUpperCase()
}
