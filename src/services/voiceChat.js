/**
 * Chat de voz de la partida por WebRTC. El audio viaja peer-to-peer entre
 * los dos navegadores; el servidor solo retransmite la negociación
 * (READY/OFFER/ANSWER/ICE/LEAVE) vía /app/game/{id}/voice → /user/queue/voice.
 *
 * Protocolo: ambos piden micrófono y mandan READY al tenerlo. El jugador 1
 * es el INICIADOR: cuando está listo y recibe el READY del rival crea la
 * oferta; el rival solo responde (sin glare: nunca ofertan los dos). Un
 * READY del rival con la conexión ya andando significa que se reconectó:
 * el iniciador renegocia desde cero con una RTCPeerConnection nueva.
 * Si el usuario niega el micrófono se sigue en solo-escucha (recvonly).
 *
 * STUN descubre la IP pública de cada lado; cuando el P2P directo no cuaja
 * (NAT simétrico/CGNAT, común en ISPs residenciales colombianos) hace falta
 * un TURN que releve el audio. Se configura con las variables de build
 * VITE_TURN_URL (lista separada por comas), VITE_TURN_USERNAME y
 * VITE_TURN_CREDENTIAL; sin ellas, esas parejas de redes ven 'failed'.
 */
function buildIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }]
  const turnUrls = import.meta.env.VITE_TURN_URL
  if (turnUrls) {
    servers.push({
      urls: turnUrls.split(',').map((u) => u.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}
const ICE_SERVERS = buildIceServers()
// Anti-rebote: el eco de READY del rival y su READY propio llegan casi
// juntos y no deben producir dos ofertas seguidas.
const REOFFER_MIN_MS = 1500

export function createVoiceChat({ isInitiator, sendSignal, onStatusChange }) {
  let pc = null
  let localStream = null
  let micEnabled = false // arranca muteado: decisión de diseño
  let mediaReady = false
  let opponentReady = false
  let closed = false
  let pendingIce = []
  let lastOfferAt = 0
  let failedRetries = 0

  // El audio remoto no necesita estar en el DOM para sonar.
  const audio = new Audio()
  audio.autoplay = true

  const setStatus = (status) => {
    if (!closed) onStatusChange?.(status)
  }

  // En microtarea: quien nos crea lo hace dentro de un effect de React y
  // el primer status ya dispara un setState (prohibido síncrono ahí).
  queueMicrotask(() => setStatus('requesting-mic'))

  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((stream) => {
      if (closed) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      localStream = stream
      stream.getAudioTracks().forEach((t) => {
        t.enabled = micEnabled
      })
      becomeReady('waiting-rival')
    })
    .catch(() => {
      if (closed) return
      // Sin permiso de micrófono igual se puede ESCUCHAR al rival.
      becomeReady('no-mic')
    })

  function becomeReady(status) {
    mediaReady = true
    setStatus(status)
    sendSignal('READY', null)
    maybeOffer()
  }

  function teardownPeer() {
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    pendingIce = []
  }

  function newPeer() {
    teardownPeer()
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => pc.addTrack(t, localStream))
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' })
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal('ICE', JSON.stringify(event.candidate))
    }
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0]
      audio.play().catch(() => {
        // Autoplay bloqueado: sonará al siguiente gesto del usuario.
      })
    }
    pc.onconnectionstatechange = () => {
      if (!pc) return
      if (pc.connectionState === 'connected') {
        failedRetries = 0
        setStatus(localStream ? 'connected' : 'listen-only')
        logSelectedRoute()
      } else if (pc.connectionState === 'failed') {
        setStatus('failed')
        retryNegotiation()
      } else if (pc.connectionState === 'disconnected') {
        setStatus('connecting')
      }
    }
    return pc
  }

  /** Diagnóstico en consola: 'relay' = pasó por el TURN, 'srflx' = P2P vía STUN. */
  function logSelectedRoute() {
    pc?.getStats().then((stats) => {
      stats.forEach((s) => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) {
          const local = stats.get(s.localCandidateId)
          console.debug('[voz] conectada vía', local?.candidateType ?? '?')
        }
      })
    })
  }

  /**
   * ICE falló (redes sin camino directo o TURN con hipo): se renegocia
   * desde cero un par de veces antes de dar la voz por perdida. El
   * iniciador re-oferta; el otro lado re-anuncia READY para provocarlo.
   */
  function retryNegotiation() {
    if (closed || failedRetries >= 2) return
    failedRetries += 1
    if (isInitiator) {
      lastOfferAt = 0
      maybeOffer()
    } else {
      sendSignal('READY', null)
    }
  }

  async function maybeOffer() {
    if (!isInitiator || !mediaReady || !opponentReady || closed) return
    const now = Date.now()
    if (now - lastOfferAt < REOFFER_MIN_MS) return
    lastOfferAt = now
    setStatus('connecting')
    const peer = newPeer()
    const offer = await peer.createOffer()
    if (closed || pc !== peer) return
    await peer.setLocalDescription(offer)
    sendSignal('OFFER', JSON.stringify(offer))
  }

  async function flushIce() {
    const queued = pendingIce
    pendingIce = []
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {})
    }
  }

  async function handleSignal({ type, payload }) {
    if (closed) return
    try {
      if (type === 'READY') {
        opponentReady = true
        // El eco le confirma al iniciador (quizá recién reconectado) que
        // este lado sigue listo; el iniciador no eco-responde (sin bucle).
        if (!isInitiator && mediaReady) sendSignal('READY', null)
        await maybeOffer()
      } else if (type === 'OFFER') {
        if (isInitiator) return
        setStatus('connecting')
        const peer = newPeer()
        await peer.setRemoteDescription(JSON.parse(payload))
        await flushIce()
        const answer = await peer.createAnswer()
        if (closed || pc !== peer) return
        await peer.setLocalDescription(answer)
        sendSignal('ANSWER', JSON.stringify(answer))
      } else if (type === 'ANSWER') {
        if (!isInitiator || !pc) return
        await pc.setRemoteDescription(JSON.parse(payload))
        await flushIce()
      } else if (type === 'ICE') {
        const candidate = JSON.parse(payload)
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {})
        } else {
          pendingIce.push(candidate)
        }
      } else if (type === 'LEAVE') {
        teardownPeer()
        setStatus('rival-off')
      }
    } catch {
      // Una señal malformada o fuera de orden no debe tumbar la partida;
      // la renegociación por READY recupera la llamada.
    }
  }

  return {
    handleSignal,

    /**
     * Nuestro WS volvió (o queremos reintentar): si la llamada no está
     * andando, se re-anuncia READY para que el iniciador renegocie.
     */
    refresh() {
      if (closed || !mediaReady) return
      if (pc && pc.connectionState === 'connected') return
      sendSignal('READY', null)
      maybeOffer()
    },

    /** true si hay micrófono que habilitar (no negaron el permiso). */
    hasMic: () => localStream !== null,

    setMicEnabled(enabled) {
      micEnabled = enabled
      localStream?.getAudioTracks().forEach((t) => {
        t.enabled = enabled
      })
    },

    /** Audífonos en off: deja de sonar el rival sin tocar la negociación. */
    setDeafened(deafened) {
      audio.muted = deafened
    },

    /** Volumen 0-1 del canal voiceOut de Ajustes. */
    setOutputVolume(volume) {
      audio.volume = Math.max(0, Math.min(1, volume))
    },

    /** Cierre definitivo (fin de partida o unmount). No emite más status. */
    close() {
      if (closed) return
      closed = true
      sendSignal('LEAVE', null)
      teardownPeer()
      localStream?.getTracks().forEach((t) => t.stop())
      localStream = null
      audio.srcObject = null
    },
  }
}
