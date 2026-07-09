import { useEffect, useState } from 'react'
import { API_URL } from '../services/api'

/**
 * Mide el RTT al gateway cada pocos segundos cronometrando un GET liviano a
 * /actuator/health (público, misma región que el juego: es representativo de
 * la latencia de red del jugador). null = sin medida aún o request fallido.
 */
export function usePing(intervalMs = 3000) {
  const [ping, setPing] = useState(null)

  useEffect(() => {
    let cancelled = false

    const measure = async () => {
      const t0 = performance.now()
      try {
        await fetch(`${API_URL}/actuator/health`, { cache: 'no-store' })
        if (!cancelled) setPing(Math.round(performance.now() - t0))
      } catch {
        if (!cancelled) setPing(null)
      }
    }

    measure()
    const id = setInterval(measure, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return ping
}
