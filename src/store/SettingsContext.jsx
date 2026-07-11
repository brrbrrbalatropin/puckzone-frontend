import { useState } from 'react'
import { SettingsContext } from './settings-context'

/**
 * Ajustes del jugador (por ahora solo audio), persistidos en localStorage.
 * Los consumidores reales llegan despues (musica, SFX, voz WebRTC): este
 * contexto es la unica fuente de verdad de volumenes para no tener que
 * migrar nada cuando existan. Cada canal tiene volumen 0-100 y silencio
 * independiente, asi silenciar no pierde el volumen elegido.
 * (La lista de canales vive en settings-context.js como AUDIO_CHANNELS.)
 */
const DEFAULT_SETTINGS = {
  music: { volume: 70, muted: false },
  sfx: { volume: 80, muted: false },
  micIn: { volume: 100, muted: false },
  voiceOut: { volume: 100, muted: false },
}

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem('puckzone_settings')
    if (!raw) return DEFAULT_SETTINGS
    const stored = JSON.parse(raw)
    // Merge con los defaults: si un dia se agrega un canal nuevo, los
    // ajustes viejos guardados no lo tienen y no debe quedar undefined.
    const merged = {}
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      merged[key] = { ...DEFAULT_SETTINGS[key], ...stored[key] }
    }
    return merged
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadStoredSettings)

  const updateChannel = (channelId, patch) => {
    setSettings((prev) => {
      const next = { ...prev, [channelId]: { ...prev[channelId], ...patch } }
      localStorage.setItem('puckzone_settings', JSON.stringify(next))
      return next
    })
  }

  const value = {
    settings,
    setVolume: (channelId, volume) => updateChannel(channelId, { volume }),
    toggleMute: (channelId) =>
      updateChannel(channelId, { muted: !settings[channelId].muted }),
    /** Volumen efectivo 0-1 para los reproductores (0 si esta silenciado). */
    effectiveVolume: (channelId) => {
      const channel = settings[channelId]
      return channel.muted ? 0 : channel.volume / 100
    },
  }

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}
