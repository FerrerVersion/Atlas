import { useEffect, useRef } from 'react'
import { navigationState, voicePrompt } from '@/features/navigation/navigationProgress'
import { deadReckonProgress, updateTracker } from '@/features/navigation/liveTracking'
import { setPreciseTracking, startTracking } from './useGeolocation'
import { smoothLocation, smoothProgress } from '@/features/navigation/smoothMotion'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/** Velocidad de la simulación (multiplicador sobre el tiempo real estimado). */
export const SIM_SPEEDUP = 8

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
  const spoken = useRef(new Set<string>())

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
      heading: user.heading ?? null,
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
      app.notify(state.wrongWay ? 'Vas en sentido contrario: buscando la mejor ruta desde aquí…' : 'Recalculando la ruta desde tu posición…', 'info')
      // Con el rumbo actual: la nueva ruta sigue hacia donde circulas si es razonable,
      // en lugar de mandarte dar la vuelta en mitad de la calle.
      const heading = state.course.moving && state.course.course !== null ? Math.round(state.course.course) : undefined
      app.rerouteFrom({
        id: `gps:${fix.lat.toFixed(6)},${fix.lng.toFixed(6)}`,
        name: 'Mi ubicación',
        kind: 'coordinates',
        kindLabel: 'Ubicación GPS',
        lat: fix.lat,
        lng: fix.lng,
        source: 'gps',
        heading,
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
      // Velocidad real estimada del tramo por el que va (la simulación avanza ×8, pero la
      // velocidad mostrada es la del coche: antes salía la media ×8, p. ej. «173 km/h»).
      speedKmh: segmentSpeedKmh(route, progress),
    })
  }, [active, simulating, route, progress])

  // Sin lecturas del GPS (túnel): se estima el avance con la última velocidad, un tiempo limitado.
  useEffect(() => {
    if (!active || simulating || !route) return
    const id = setInterval(() => {
      const s = useNavStore.getState()
      const predicted = deadReckonProgress(s.live, Date.now(), route.distance)
      if (predicted !== null && predicted > s.navigation.progress) s.setNavProgress(predicted)
    }, 1000)
    return () => clearInterval(id)
  }, [active, simulating, route])

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
    if (!active || !route) return
    // La simulación ya avanza en cada fotograma: se coloca tal cual (suavizarla solo añade retraso).
    if (simulating) smoothProgress.reset([progress])
    else smoothProgress.setTarget([progress])
  }, [active, route, progress, simulating])
  useEffect(() => {
    if (user) smoothLocation.setTarget([user.lat, user.lng])
    else smoothLocation.reset(null)
  }, [user])

  // Voz: solo avisos que hacen falta, cada uno una vez (ver voicePrompt).
  useEffect(() => {
    if (!active || !voice || !route || typeof speechSynthesis === 'undefined') return
    const state = navigationState(route, progress)
    const live = useNavStore.getState().live
    const speedMs = simulating ? segmentSpeedKmh(route, progress) / 3.6 : live.speedKmh !== null ? live.speedKmh / 3.6 : null
    const prompt = voicePrompt(route, state, speedMs, routeKey(route))
    if (!prompt || spoken.current.has(prompt.key)) return
    spoken.current.add(prompt.key)
    const u = new SpeechSynthesisUtterance(prompt.text)
    u.lang = 'es-ES'
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }, [active, voice, route, progress, simulating])
}

/** Identificador estable de cada ruta (las claves de voz no se mezclan entre rutas). */
const routeIds = new WeakMap<object, string>()
let routeSeq = 0
function routeKey(route: object): string {
  let id = routeIds.get(route)
  if (!id) routeIds.set(route, (id = `r${++routeSeq}`))
  return id
}

/** Componente sin interfaz: aísla los renders del GPS y de la simulación del resto de la app. */
export function NavigationRunner() {
  useNavigationRunner()
  return null
}

/** Velocidad media estimada (km/h) del tramo de la ruta en el que está el avance. */
export function segmentSpeedKmh(route: Parameters<typeof navigationState>[0], progress: number): number {
  const seg = navigationState(route, progress).current
  if (seg.distance > 0 && seg.duration > 0) return (seg.distance / seg.duration) * 3.6
  return (route.distance / Math.max(route.duration, 1)) * 3.6
}
