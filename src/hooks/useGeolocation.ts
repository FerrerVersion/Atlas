import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** Ubicación del usuario (solo si concede permiso). Nunca se envía a servidores. */
export function useGeolocation() {
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const locate = useCallback((opts: { fly?: boolean; watch?: boolean } = {}) => {
    const { notify, setUserLocation, flyTo } = useAppStore.getState()
    if (!('geolocation' in navigator)) {
      notify('Tu navegador no permite obtener la ubicación.', 'error')
      return
    }
    const onPos = (pos: GeolocationPosition, first: boolean) => {
      const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords
      setUserLocation({ lat, lng, accuracy, heading: heading ?? null })
      if (first && opts.fly !== false) flyTo(lat, lng, 16)
    }
    const onErr = (err: GeolocationPositionError) => {
      notify(
        err.code === err.PERMISSION_DENIED
          ? 'Permiso de ubicación denegado.'
          : 'No se ha podido obtener tu ubicación.',
        'error',
      )
    }
    navigator.geolocation.getCurrentPosition((p) => onPos(p, true), onErr, { enableHighAccuracy: true, timeout: 15000 })
    if (opts.watch) {
      stop()
      watchId.current = navigator.geolocation.watchPosition((p) => onPos(p, false), onErr, { enableHighAccuracy: true })
    }
  }, [stop])

  useEffect(() => stop, [stop])
  return { locate, stop }
}
