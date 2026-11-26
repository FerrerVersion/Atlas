import { useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/**
 * Seguimiento de la ubicación del dispositivo. Hay un único `watchPosition`
 * compartido por toda la app (botón «Mi ubicación», origen GPS, navegación).
 *
 * - Nunca se activa solo: únicamente cuando el usuario pulsa «Mi ubicación»,
 *   «Usar mi ubicación» o «Iniciar» la navegación.
 * - Precisión normal (menos batería) salvo durante la navegación, que pide el GPS
 *   de alta precisión con lecturas frescas.
 * - La posición nunca se envía a ningún servidor.
 */
let watchId: number | null = null
let watchPrecise = false
let precise = false
let flyOnNextFix = false
/** `mapTarget.nonce` cuando se pidió centrar: si el usuario busca otra cosa antes del primer dato, no se le mueve el mapa. */
let targetNonceAtRequest: number | null = null
let silentErrors = false

/** Navegación: lecturas de alta precisión y frescas (≤ 1 s) para medir la ruta en tiempo real. */
export const PRECISE_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 1_000, timeout: 30_000 }
/** Fuera de la navegación basta con la ubicación aproximada del sistema (menos consumo). */
export const NORMAL_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 10_000, timeout: 30_000 }

/** Comprueba que el navegador puede dar la ubicación; si no, avisa (salvo en modo silencioso). */
function geolocationAvailable(silent = false): boolean {
  const { notify } = useAppStore.getState()
  const { setLocationStatus } = useNavStore.getState()
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
  const nav = useNavStore.getState()
  const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords
  nav.setUserLocation({ lat, lng, accuracy, heading: heading ?? null, speed: speed ?? null, timestamp: pos.timestamp || Date.now() })
  if (nav.locationStatus !== 'active') nav.setLocationStatus('active')
  if (flyOnNextFix) {
    flyOnNextFix = false
    const app = useAppStore.getState()
    const userMovedOn = targetNonceAtRequest !== (app.mapTarget?.nonce ?? null)
    if (!userMovedOn) app.flyTo(lat, lng, 16)
  }
}

function onError(err: GeolocationPositionError) {
  const nav = useNavStore.getState()
  const { notify } = useAppStore.getState()
  if (err.code === err.PERMISSION_DENIED) {
    stopTracking()
    nav.setLocationStatus('denied')
    if (!silentErrors) notify('Permiso de ubicación denegado. Actívalo en los ajustes del navegador para este sitio.', 'error')
    return
  }
  // Sin señal momentánea: el seguimiento continúa y se recuperará solo.
  if (!silentErrors && !nav.userLocation) notify('No se ha podido obtener tu ubicación todavía.', 'error')
}

function watch() {
  watchPrecise = precise
  watchId = navigator.geolocation.watchPosition(onPosition, onError, precise ? PRECISE_OPTIONS : NORMAL_OPTIONS)
}

/**
 * Inicia (una sola vez) el seguimiento continuo. `fly` centra el mapa en el
 * primer dato. `silent` evita avisos si el permiso se deniega.
 */
export function startTracking(opts: { fly?: boolean; silent?: boolean } = {}) {
  if (!geolocationAvailable(opts.silent)) return
  silentErrors = !!opts.silent
  const app = useAppStore.getState()
  const nav = useNavStore.getState()
  if (opts.fly) {
    if (watchId !== null && nav.userLocation) {
      app.flyTo(nav.userLocation.lat, nav.userLocation.lng, 16)
      return
    }
    flyOnNextFix = true
    targetNonceAtRequest = app.mapTarget?.nonce ?? null
  }
  if (watchId !== null) return
  nav.setLocationStatus('pending')
  watch()
}

/**
 * Cambia entre GPS de alta precisión (navegación) y precisión normal. Si el
 * seguimiento ya está activo con otro modo, se reinicia con el nuevo.
 */
export function setPreciseTracking(value: boolean) {
  precise = value
  if (watchId !== null && watchPrecise !== precise) {
    navigator.geolocation.clearWatch(watchId)
    watch()
  }
}

export function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  flyOnNextFix = false
}

export const isTracking = () => watchId !== null

/** Posición actual: usa la del seguimiento si existe; si no, la pide una vez (con precisión, es un origen de ruta). */
export function requestPosition(): Promise<{ lat: number; lng: number } | null> {
  const known = useNavStore.getState().userLocation
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
        silentErrors = false
        onError(err)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    ),
  )
}

/** API para componentes (botón «Mi ubicación», navegación). */
export function useGeolocation() {
  const locate = useCallback((opts: { fly?: boolean; watch?: boolean } = {}) => {
    startTracking({ fly: opts.fly !== false })
  }, [])
  return { locate, stop: stopTracking }
}
