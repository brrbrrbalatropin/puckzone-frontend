import seleccionarUrl from '../assets/sounds/seleccionar.mp3'
import poderApareceUrl from '../assets/sounds/poder.mp3'
import poderZonaUrl from '../assets/sounds/poder-2.mp3'
import poderCaosUrl from '../assets/sounds/poder-3.mp3'
import puntoAnotadoUrl from '../assets/sounds/punto-anotado.mp3'

/**
 * Efectos de sonido (canal `sfx` de Ajustes). SettingsProvider empuja aquí
 * el volumen efectivo con setSfxVolume cada vez que cambia, así playSfx se
 * puede llamar desde cualquier parte (botones, eventos de partida) sin
 * cargar con el contexto. El catálogo completo de archivos, incluidos los
 * aún sin asignar, vive en src/assets/sounds/SONIDOS.md.
 */
const SOUND_URLS = {
  seleccionar: seleccionarUrl, // clic en los botones principales
  poderAparece: poderApareceUrl, // brota un pickup en el tablero
  poderZona: poderZonaUrl, // se recoge zona rápida o zona lenta
  poderCaos: poderCaosUrl, // se recoge caos
  puntoAnotado: puntoAnotadoUrl, // gol de cualquiera de los dos
}

let sfxVolume = 1

export function setSfxVolume(volume) {
  sfxVolume = volume
}

export function playSfx(name) {
  const url = SOUND_URLS[name]
  if (!url || sfxVolume <= 0) return
  // Un Audio nuevo por reproducción: dos sonidos pueden solaparse (gol
  // mientras suena un poder) y el navegador cachea el archivo igual.
  const audio = new Audio(url)
  audio.volume = sfxVolume
  // Sin un gesto previo del usuario (p. ej. refresh directo a /game) el
  // navegador puede negar el play: el sonido se pierde y no pasa nada.
  audio.play().catch(() => {})
}
