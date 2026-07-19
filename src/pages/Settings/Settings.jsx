import { useEffect, useRef, useState } from 'react'
import Header from '../../components/Header'
import { useSettings } from '../../hooks/useSettings'
import { AUDIO_CHANNELS } from '../../store/settings-context'

/**
 * Pantalla de ajustes. Sliders de audio (musica, efectos, microfono y voz)
 * guardados al instante en el SettingsContext; la musica y el chat de voz
 * llegan despues y leeran de ahi. Incluye un probador de microfono real:
 * pide el mic con getUserMedia y pinta el nivel de entrada, escalado por el
 * slider de microfono para que se vea el efecto del ajuste.
 */
export default function Settings() {
  const { settings, setVolume, toggleMute } = useSettings()

  const [micTesting, setMicTesting] = useState(false)
  const [micError, setMicError] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  // Recursos vivos del test (stream + AudioContext + requestAnimationFrame)
  // fuera del estado de React: solo se crean/destruyen, no se renderizan.
  const micResources = useRef(null)

  const stopMicTest = () => {
    const res = micResources.current
    if (!res) return
    cancelAnimationFrame(res.rafId)
    res.stream.getTracks().forEach((track) => track.stop())
    res.audioContext.close()
    micResources.current = null
    setMicTesting(false)
    setMicLevel(0)
  }

  const startMicTest = async () => {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 512
      audioContext.createMediaStreamSource(stream).connect(analyser)

      const samples = new Uint8Array(analyser.frequencyBinCount)
      const res = { stream, audioContext, rafId: 0 }
      micResources.current = res

      const measure = () => {
        analyser.getByteTimeDomainData(samples)
        let peak = 0
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample - 128) / 128)
        }
        const gain = micResources.current?.gain ?? 1
        setMicLevel(Math.min(1, peak * 1.4 * gain))
        res.rafId = requestAnimationFrame(measure)
      }
      measure()
      setMicTesting(true)
    } catch {
      setMicError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
    }
  }

  // El slider de microfono escala el medidor en vivo sin re-crear el test.
  const micGain = settings.micIn.muted ? 0 : settings.micIn.volume / 100
  useEffect(() => {
    if (micResources.current) {
      micResources.current.gain = micGain
    }
  }, [micGain])

  // Apagar el test al salir de la pantalla (libera el mic del navegador).
  useEffect(() => stopMicTest, [])

  return (
    <div className="app-page">
      <Header />

      <main className="settings-main">
        <h2>Ajustes</h2>

        <section className="settings-card">
          <h3>Audio</h3>
          <p className="settings-hint">
            La música, los efectos y el chat de voz llegan pronto; tus
            volúmenes quedan guardados desde ya.
          </p>

          {AUDIO_CHANNELS.map(({ id, label, hint }) => {
            const channel = settings[id]
            return (
              <div key={id} className={`setting-row${channel.muted ? ' muted' : ''}`}>
                <div className="setting-labels">
                  <span className="setting-name">{label}</span>
                  <span className="setting-desc">{hint}</span>
                </div>
                <div className="setting-controls">
                  <button
                    type="button"
                    className="mute-button"
                    aria-label={channel.muted ? `Activar ${label}` : `Silenciar ${label}`}
                    title={channel.muted ? 'Activar' : 'Silenciar'}
                    onClick={() => toggleMute(id)}
                  >
                    {channel.muted ? '🔇' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={channel.volume}
                    style={{ '--fill': `${channel.volume}%` }}
                    onChange={(e) => setVolume(id, Number(e.target.value))}
                  />
                  <span className="setting-value">{channel.volume}%</span>
                </div>
              </div>
            )
          })}
        </section>

        <section className="settings-card">
          <h3>Probar micrófono</h3>
          <p className="settings-hint">
            Habla y verifica que la barra se mueva; así sabrás que el chat de
            voz te va a escuchar.
          </p>

          <div className="mic-test">
            <button type="button" onClick={micTesting ? stopMicTest : startMicTest}>
              {micTesting ? 'Detener prueba' : 'Probar micrófono'}
            </button>
            {/* Barra decorativa: la prueba del micrófono es visual (ver la
                barra moverse); sin un aria-valuenow útil, mejor ocultarla al
                lector de pantalla que anunciar un medidor vacío. */}
            <div className="mic-meter" aria-hidden="true">
              <div
                className="mic-meter-fill"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>
          {micError && <p className="form-error">{micError}</p>}
        </section>
      </main>
    </div>
  )
}
