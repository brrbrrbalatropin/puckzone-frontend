import { createContext } from 'react'

// Contexto de ajustes (audio); el valor lo provee <SettingsProvider>
// (SettingsContext.jsx) y se consume via el hook useSettings.
export const SettingsContext = createContext(null)
