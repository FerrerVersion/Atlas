import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** Comprueba que el navegador puede dar la ubicación; si no, avisa y devuelve false. */
function geolocationAvailable(): boolean {
  const { notify } = useAppStore.getState()
  if (!window.isSecureContext) {
    notify(
      'La ubicación solo funciona con HTTPS o en localhost. Desde el móvil abre la app con `npm run dev:movil` (https://…).',
      'error',
    )
    return false
  }
  if (!('geolocation' in navigator)) {
    notify('Tu navegador no permite obtener la ubicación.', 'error')
    return false
  }
  return true
}

function notifyGeoError(err: GeolocationPositionError) {
  useAppStore
    .getState()
    .notify(
      err.code === err.PERMISSION_DENIED
        ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador para este sitio.'
        : 'No se ha podido obtener tu ubicación.',
      'error',
    )
}

/** Posición actual una sola vez (también la guarda en el store). */
export function requestPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!geolocationAvailable()) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy, heading } = p.coords
        useAppStore.getState().setUserLocation({ lat, lng, accuracy, heading: heading ?? null })
        resolve({ lat, lng })
      },
      (err) => {
        notifyGeoError(err)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    ),
  )
}

/** Ubicación del usuario (solo si concede permiso). Nunca se envía a servidores. */
export function useGeolocation() {
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const locate = useCallback((opts: { fly?: boolean; watch?: boolean } = {}) => {
    const { setUserLocation, flyTo } = useAppStore.getState()
    if (!geolocationAvailable()) return
    const onPos = (pos: GeolocationPosition, first: boolean) => {
      const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords
      setUserLocation({ lat, lng, accuracy, heading: heading ?? null })
      if (first && opts.fly !== false) flyTo(lat, lng, 16)
    }
    const onErr = notifyGeoError
    navigator.geolocation.getCurrentPosition((p) => onPos(p, true), onErr, { enableHighAccuracy: true, timeout: 15000 })
    if (opts.watch) {
      stop()
      watchId.current = navigator.geolocation.watchPosition((p) => onPos(p, false), onErr, { enableHighAccuracy: true })
    }
  }, [stop])

  useEffect(() => stop, [stop])
  return { locate, stop }
}
