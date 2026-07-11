import { useContext } from 'react'
import { SettingsContext } from '../store/settings-context'

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>')
  return ctx
}
