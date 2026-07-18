import { createContext } from 'react'

// Contexto de ajustes (audio); el valor lo provee <SettingsProvider>
// (SettingsContext.jsx) y se consume via el hook useSettings.
export const SettingsContext = createContext(null)

// Canales de audio configurables. Viven aqui (archivo sin componentes) para
// que SettingsContext.jsx solo exporte el provider y Fast Refresh funcione.
export const AUDIO_CHANNELS = [
  { id: 'music', label: 'Música', hint: 'Banda sonora del juego (próximamente)' },
  { id: 'sfx', label: 'Efectos de sonido', hint: 'Goles, poderes y botones' },
  { id: 'micIn', label: 'Micrófono', hint: 'Tu voz en el chat de voz (próximamente)' },
  { id: 'voiceOut', label: 'Voz de los demás', hint: 'Volumen al que escuchas a tu rival (próximamente)' },
]
