import seleccionarUrl from '../assets/sounds/seleccionar.mp3'
import menuMasUrl from '../assets/sounds/menu-mas.mp3'
import menuRetrocesoUrl from '../assets/sounds/menu-retroceso.mp3'
import esperaUrl from '../assets/sounds/espera.mp3'
import rivalEncontradoUrl from '../assets/sounds/rival-encontrado.mp3'
import mensajeChatUrl from '../assets/sounds/mensaje-chat.mp3'
import inicioPartidaUrl from '../assets/sounds/inicio-partida.mp3'
import golFavorUrl from '../assets/sounds/gol-favor.mp3'
import golContraUrl from '../assets/sounds/gol-contra.mp3'
import victoriaUrl from '../assets/sounds/victoria.mp3'
import derrotaUrl from '../assets/sounds/derrota.mp3'
import poderApareceUrl from '../assets/sounds/poder-aparece.mp3'
import poderCaosUrl from '../assets/sounds/poder-caos.mp3'
import poderZonaRapidaUrl from '../assets/sounds/poder-zona-rapida.mp3'
import poderZonaLentaUrl from '../assets/sounds/poder-zona-lenta.mp3'
import poderObstaculoUrl from '../assets/sounds/poder-obstaculo.mp3'
import poderFantasmaUrl from '../assets/sounds/poder-fantasma.mp3'
import poderEscudoUrl from '../assets/sounds/poder-escudo.mp3'
import musicaPrincipalUrl from '../assets/sounds/musica-principal.mp3'
import rebote1Url from '../assets/sounds/rebote-1.mp3'
import rebote2Url from '../assets/sounds/rebote-2.mp3'
import rebote3Url from '../assets/sounds/rebote-3.mp3'

/**
 * Efectos de sonido (canal `sfx` de Ajustes). SettingsProvider empuja aquí
 * el volumen efectivo con setSfxVolume cada vez que cambia, así playSfx se
 * puede llamar desde cualquier parte (botones, eventos de partida) sin
 * cargar con el contexto. El catálogo completo de archivos, incluidos los
 * aún sin asignar, vive en src/assets/sounds/SONIDOS.md.
 */
const SOUND_URLS = {
  seleccionar: seleccionarUrl, // clic en los botones principales
  menuMas: menuMasUrl, // avanzar: entrar a una sección del menú
  menuRetroceso: menuRetrocesoUrl, // retroceder: volver, cancelar
  espera: esperaUrl, // se entra a la cola de matchmaking
  rivalEncontrado: rivalEncontradoUrl, // el matchmaking emparejó
  mensajeChat: mensajeChatUrl, // llega un DM de otra persona
  inicioPartida: inicioPartidaUrl, // arranque de la partida, una sola vez
  golFavor: golFavorUrl, // gol propio
  golContra: golContraUrl, // gol del rival
  victoria: victoriaUrl, // fin de partida ganada
  derrota: derrotaUrl, // fin de partida perdida
  poderAparece: poderApareceUrl, // brota un pickup en el tablero
  poderCaos: poderCaosUrl,
  poderZonaRapida: poderZonaRapidaUrl,
  poderZonaLenta: poderZonaLentaUrl,
  poderObstaculo: poderObstaculoUrl,
  poderFantasma: poderFantasmaUrl,
  poderEscudo: poderEscudoUrl,
}

/** Sonido de recogida por tipo de efecto que manda el servidor. */
export const POWER_SFX = {
  OBSTACLE: 'poderObstaculo',
  FAST_ZONE: 'poderZonaRapida',
  SLOW_ZONE: 'poderZonaLenta',
  GHOST_PUCK: 'poderFantasma',
  SHIELD: 'poderEscudo',
  CHAOS: 'poderCaos',
}

// Las 3 variantes de rebote se eligen al azar en cada golpe: es el sonido
// que más se repite en una partida y una sola muestra cansa el oído. Las
// otras 5 que llegaron en el drop se descartaron por confusas (2026-07-20).
const REBOTE_URLS = [rebote1Url, rebote2Url, rebote3Url]

let sfxVolume = 1

export function setSfxVolume(volume) {
  sfxVolume = volume
}

function reproducir(url) {
  if (!url || sfxVolume <= 0) return
  // Un Audio nuevo por reproducción: dos sonidos pueden solaparse (gol
  // mientras suena un poder) y el navegador cachea el archivo igual.
  const audio = new Audio(url)
  audio.volume = sfxVolume
  // Sin un gesto previo del usuario (p. ej. refresh directo a /game) el
  // navegador puede negar el play: el sonido se pierde y no pasa nada.
  audio.play().catch(() => {})
}

export function playSfx(name) {
  reproducir(SOUND_URLS[name])
}

/** Rebote del disco: una de las 3 variantes, al azar. */
export function playRebote() {
  reproducir(REBOTE_URLS[Math.floor(Math.random() * REBOTE_URLS.length)])
}

// --- Música de fondo (canal `music` de Ajustes) -------------------------
// Instancia única en loop, a diferencia de los efectos: dos pistas sonando
// encima serían un desastre y hay que poder subirle el volumen o pararla
// desde cualquier parte.

let musicVolume = 0.7
let musica = null
let esperandoGesto = false

export function setMusicVolume(volume) {
  musicVolume = volume
  if (musica) musica.volume = volume
}

/**
 * Si el navegador niega el play por falta de gesto del usuario (entrar
 * directo a la URL, recargar), se reintenta una sola vez en la primera
 * interacción que haya. Sin esto la música no vuelve nunca en esa pestaña.
 */
function reintentarConGesto() {
  if (esperandoGesto) return
  esperandoGesto = true
  const alInteractuar = () => {
    esperandoGesto = false
    document.removeEventListener('pointerdown', alInteractuar)
    document.removeEventListener('keydown', alInteractuar)
    musica?.play().catch(() => {})
  }
  document.addEventListener('pointerdown', alInteractuar, { once: true })
  document.addEventListener('keydown', alInteractuar, { once: true })
}

export function playMusic() {
  if (musica) {
    // Ya estaba: volver de otra pantalla no reinicia la pista desde cero.
    if (musica.paused) musica.play().catch(reintentarConGesto)
    return
  }
  musica = new Audio(musicaPrincipalUrl)
  musica.loop = true
  musica.volume = musicVolume
  musica.play().catch(reintentarConGesto)
}

export function stopMusic() {
  musica?.pause()
}
