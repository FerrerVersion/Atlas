import { useEffect, useRef } from 'react'
import { announce, navigationState } from '@/features/navigation/navigationProgress'
import { formatDistance } from '@/utils/distance'
import { updateTracker } from '@/features/navigation/liveTracking'
import { startTracking } from './useGeolocation'
import { useAppStore } from '@/store/useAppStore'

/** Velocidad de la simulación (multiplicador sobre el tiempo real estimado). */
const SIM_SPEEDUP = 8

/**
 * Avanza el progreso de navegación: simulación sobre la ruta o seguimiento GPS en
 * tiempo real (ver liveTracking.ts), recalcula si te desvías, mantiene la pantalla
 * encendida y, opcionalmente, anuncia las maniobras por voz (síntesis local).
 */
export function useNavigationRunner() {
  const active = useAppStore((s) => s.navigation.active)
  const simulating = useAppStore((s) => s.navigation.simulating)
  const route = useAppStore((s) => s.route)
  const user = useAppStore((s) => s.userLocation)
  const voice = useAppStore((s) => s.navPrefs.voice)
  const progress = useAppStore((s) => s.navigation.progress)
  const lastSpoken = useRef<string>('')

  // Simulación
  useEffect(() => {
    if (!active || !simulating || !route) return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const { navigation, setNavProgress, setNavFlags } = useAppStore.getState()
      const state = navigationState(route, navigation.progress)
      const speed = route.distance / Math.max(route.duration, 1) // m/s medio
      const next = navigation.progress + speed * SIM_SPEEDUP * dt
      if (state.arrived || next >= route.distance) {
        setNavProgress(route.distance)
        setNavFlags({ simulating: false })
        return
      }
      setNavProgress(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, simulating, route])

  // Seguimiento GPS en tiempo real: en cuanto hay una ruta se mide el avance con cada
  // lectura del dispositivo (aunque no se haya pulsado «Iniciar»).
  useEffect(() => {
    if (!route || !user || simulating) return
    const s = useAppStore.getState()
    const fix = {
      lat: user.lat,
      lng: user.lng,
      accuracy: user.accuracy,
      speed: user.speed ?? null,
      timestamp: user.timestamp ?? Date.now(),
    }
    const { state, event } = updateTracker(s.live, fix, route)
    s.setLive(state)
    if (!active) return
    if (state.status === 'tracking' || state.status === 'arrived') s.setNavProgress(state.progress)
    if (event === 'off-route') s.notify('Te has desviado de la ruta.', 'info')
    if (event === 'back-on-route') s.notify('De nuevo en la ruta.', 'success')
    if (event === 'arrived') s.notify('Has llegado a tu destino.', 'success')
    if (event === 'reroute') {
      s.notify('Recalculando la ruta desde tu posición…', 'info')
      s.rerouteFrom({
        id: `gps:${fix.lat.toFixed(6)},${fix.lng.toFixed(6)}`,
        name: 'Mi ubicación',
        kind: 'coordinates',
        kindLabel: 'Ubicación GPS',
        lat: fix.lat,
        lng: fix.lng,
        source: 'gps',
      })
    }
  }, [active, simulating, route, user])

  // En simulación, el recorrido y la velocidad salen del propio avance simulado.
  useEffect(() => {
    if (!active || !simulating || !route) return
    const s = useAppStore.getState()
    const live = s.live
    s.setLive({
      ...live,
      startedAt: live.startedAt ?? Date.now(),
      progress,
      traveled: progress,
      status: progress >= route.distance ? 'arrived' : 'tracking',
      speedKmh: (route.distance / Math.max(route.duration, 1)) * 3.6 * SIM_SPEEDUP,
    })
  }, [active, simulating, route, progress])

  // Durante la navegación: seguimiento GPS activo y pantalla encendida.
  useEffect(() => {
    if (!active) return
    startTracking({ silent: true })
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const acquire = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined)
    acquire()
    // El bloqueo se pierde al cambiar de app: se recupera al volver.
    const onVisible = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => undefined)
    }
  }, [active])

  // Voz
  useEffect(() => {
    if (!active || !voice || !route || typeof speechSynthesis === 'undefined') return
    const state = navigationState(route, progress)
    const key = state.next ? `${state.nextIndex}:${state.distanceToNext < 120 ? 'near' : 'far'}` : 'arrived'
    // Se anuncia al empezar cada tramo ("far") y otra vez a menos de 120 m ("near").
    if (key === lastSpoken.current) return
    lastSpoken.current = key
    const u = new SpeechSynthesisUtterance(announce(state, formatDistance))
    u.lang = 'es-ES'
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }, [active, voice, route, progress])
}
