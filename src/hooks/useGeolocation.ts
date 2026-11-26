import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'

/**
 * Seguimiento de la ubicación del dispositivo. Hay un único `watchPosition`
 * compartido por toda la app (botón «Mi ubicación», origen GPS, navegación).
 * La posición nunca se envía a ningún servidor.
 */
let watchId: number | null = null
let flyOnNextFix = false
/** `mapTarget.nonce` cuando se pidió centrar: si el usuario busca otra cosa antes del primer dato, no se le mueve el mapa. */
let targetNonceAtRequest: number | null = null

// Lecturas frescas (≤ 1 s) para medir la ruta en tiempo real.
const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 1_000, timeout: 30_000 }

/** Comprueba que el navegador puede dar la ubicación; si no, avisa (salvo en modo silencioso). */
function geolocationAvailable(silent = false): boolean {
  const { notify, setLocationStatus } = useAppStore.getState()
  if (!window.isSecureContext) {
    setLocationStatus('unavailable')
    notify(
      'La ubicación solo funciona con HTTPS o en localhost. Desde el móvil abre la app con `npm run dev:movil` (https://…).',
      'error',
    )
    return false
  }
  if (!('geolocation' in navigator)) {
    setLocationStatus('unavailable')
    if (!silent) notify('Tu navegador no permite obtener la ubicación.', 'error')
    return false
  }
  return true
}

function onPosition(pos: GeolocationPosition) {
  const s = useAppStore.getState()
  const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords
  s.setUserLocation({ lat, lng, accuracy, heading: heading ?? null, speed: speed ?? null, timestamp: pos.timestamp || Date.now() })
  s.setLocationStatus('active')
  if (flyOnNextFix) {
    flyOnNextFix = false
    const userMovedOn = targetNonceAtRequest !== (s.mapTarget?.nonce ?? null)
    if (!userMovedOn) s.flyTo(lat, lng, 16)
  }
}

function errorHandler(silent: boolean) {
  return (err: GeolocationPositionError) => {
    const s = useAppStore.getState()
    if (err.code === err.PERMISSION_DENIED) {
      stopTracking()
      s.setLocationStatus('denied')
      // Al abrir la web, si el usuario dice que no, se respeta sin insistir.
      if (!silent) s.notify('Permiso de ubicación denegado. Actívalo en los ajustes del navegador para este sitio.', 'error')
      return
    }
    // Sin señal momentánea: el seguimiento continúa y se recuperará solo.
    if (!silent && !s.userLocation) s.notify('No se ha podido obtener tu ubicación todavía.', 'error')
  }
}

/**
 * Inicia (una sola vez) el seguimiento continuo. `fly` centra el mapa en el
 * primer dato. `silent` evita avisos si el permiso se deniega al abrir la web.
 */
export function startTracking(opts: { fly?: boolean; silent?: boolean } = {}) {
  if (!geolocationAvailable(opts.silent)) return
  const s = useAppStore.getState()
  if (opts.fly) {
    if (watchId !== null && s.userLocation) {
      s.flyTo(s.userLocation.lat, s.userLocation.lng, 16)
      return
    }
    flyOnNextFix = true
    targetNonceAtRequest = s.mapTarget?.nonce ?? null
  }
  if (watchId !== null) return
  s.setLocationStatus('pending')
  watchId = navigator.geolocation.watchPosition(onPosition, errorHandler(!!opts.silent), WATCH_OPTIONS)
}

export function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  flyOnNextFix = false
}

export const isTracking = () => watchId !== null

/** Posición actual: usa la del seguimiento si existe; si no, la pide una vez. */
export function requestPosition(): Promise<{ lat: number; lng: number } | null> {
  const known = useAppStore.getState().userLocation
  if (known) return Promise.resolve({ lat: known.lat, lng: known.lng })
  if (!geolocationAvailable()) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onPosition(p)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude })
        startTracking({ silent: true })
      },
      (err) => {
        errorHandler(false)(err)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    ),
  )
}

export type GateState = 'checking' | 'ask' | 'pending' | 'denied' | 'unavailable' | 'granted'

/** Estado inicial del permiso: si el navegador ya lo concedió, no hace falta preguntar. */
async function initialGateState(): Promise<GateState> {
  if (!window.isSecureContext || !('geolocation' in navigator)) return 'unavailable'
  try {
    const st = await navigator.permissions?.query?.({ name: 'geolocation' as PermissionName })
    if (st?.state === 'granted') return 'granted'
    if (st?.state === 'denied') return 'denied'
  } catch {
    /* Permissions API no disponible: se pregunta con el botón */
  }
  return 'ask'
}

/**
 * Puerta de entrada: la app no arranca hasta que el usuario permite la ubicación.
 * Cuando se concede, centra el mapa donde está y la mantiene actualizada.
 */
export function useLocationGate() {
  const [initial, setInitial] = useState<GateState>('checking')
  const [requested, setRequested] = useState(false)
  const status = useAppStore((s) => s.locationStatus)

  useEffect(() => {
    let cancelled = false
    initialGateState().then((st) => {
      if (cancelled) return
      setInitial(st)
      if (st === 'granted') startTracking({ fly: true, silent: true })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const request = useCallback(() => {
    setRequested(true)
    startTracking({ fly: true, silent: true })
  }, [])

  // Tras pulsar el botón: con el primer dato se entra; si se deniega, se explica cómo activarlo.
  let state = initial
  if (requested && initial !== 'granted') {
    state = status === 'active' ? 'granted' : status === 'denied' || status === 'unavailable' ? status : 'pending'
  }
  return { state, request }
}

/** API para componentes (botón «Mi ubicación», navegación). */
export function useGeolocation() {
  const locate = useCallback((opts: { fly?: boolean; watch?: boolean } = {}) => {
    startTracking({ fly: opts.fly !== false })
  }, [])
  return { locate, stop: stopTracking }
}
