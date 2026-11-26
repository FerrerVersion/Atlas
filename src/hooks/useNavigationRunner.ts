import { useEffect, useRef } from 'react'
import { announce, navigationState } from '@/features/navigation/navigationProgress'
import { formatDistance } from '@/utils/distance'
import { updateTracker } from '@/features/navigation/liveTracking'
import { setPreciseTracking, startTracking } from './useGeolocation'
import { smoothLocation, smoothProgress } from '@/features/navigation/smoothMotion'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/** Velocidad de la simulación (multiplicador sobre el tiempo real estimado). */
const SIM_SPEEDUP = 8

/**
 * Avanza el progreso de navegación: simulación sobre la ruta o seguimiento GPS en
 * tiempo real (ver liveTracking.ts), recalcula si te desvías, mantiene la pantalla
 * encendida y, opcionalmente, anuncia las maniobras por voz (síntesis local).
 */
export function useNavigationRunner() {
  const active = useNavStore((s) => s.navigation.active)
  const simulating = useNavStore((s) => s.navigation.simulating)
  const route = useAppStore((s) => s.route)
  const user = useNavStore((s) => s.userLocation)
  const voice = useAppStore((s) => s.navPrefs.voice)
  // El avance solo interesa durante la navegación (fuera de ella no provoca renders).
  const progress = useNavStore((s) => (s.navigation.active ? s.navigation.progress : 0))
  const lastSpoken = useRef<string>('')

  // Simulación
  useEffect(() => {
    if (!active || !simulating || !route) return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const { navigation, setNavProgress, setNavFlags } = useNavStore.getState()
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
    const s = useNavStore.getState()
    const app = useAppStore.getState()
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
    if (event === 'off-route') app.notify('Te has desviado de la ruta.', 'info')
    if (event === 'back-on-route') app.notify('De nuevo en la ruta.', 'success')
    if (event === 'arrived') app.notify('Has llegado a tu destino.', 'success')
    if (event === 'reroute') {
      app.notify('Recalculando la ruta desde tu posición…', 'info')
      app.rerouteFrom({
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
    const s = useNavStore.getState()
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
    // Navegar es la acción que necesita el GPS: se pide (con aviso si se deniega) y en
    // alta precisión solo mientras dure la navegación.
    setPreciseTracking(true)
    startTracking()
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
      setPreciseTracking(false)
    }
  }, [active])

  // Movimiento fluido: el avance mostrado se anima entre lecturas (ver smoothMotion.ts).
  useEffect(() => {
    // Ruta nueva o inicio/fin de la navegación: se coloca sin animar.
    smoothProgress.reset(active && route ? [useNavStore.getState().navigation.progress] : null)
  }, [active, route])
  useEffect(() => {
    if (active && route) smoothProgress.setTarget([progress])
  }, [active, route, progress])
  useEffect(() => {
    if (user) smoothLocation.setTarget([user.lat, user.lng])
    else smoothLocation.reset(null)
  }, [user])

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

/** Componente sin interfaz: aísla los renders del GPS y de la simulación del resto de la app. */
export function NavigationRunner() {
  useNavigationRunner()
  return null
}
