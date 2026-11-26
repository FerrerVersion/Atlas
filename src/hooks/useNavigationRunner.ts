import { useEffect, useRef } from 'react'
import { announce, navigationState } from '@/features/navigation/navigationProgress'
import { formatDistance } from '@/utils/distance'
import { locateOnPolyline } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'

/** Velocidad de la simulación (multiplicador sobre el tiempo real estimado). */
const SIM_SPEEDUP = 8

/**
 * Avanza el progreso de navegación: simulación sobre la ruta o seguimiento GPS
 * (proyectando la posición del usuario sobre la geometría). Opcionalmente
 * anuncia las maniobras con la síntesis de voz del navegador (local).
 */
export function useNavigationRunner() {
  const active = useAppStore((s) => s.navigation.active)
  const simulating = useAppStore((s) => s.navigation.simulating)
  const route = useAppStore((s) => s.route)
  const user = useAppStore((s) => s.userLocation)
  const voice = useAppStore((s) => s.navPrefs.voice)
  const progress = useAppStore((s) => s.navigation.progress)
  const lastSpoken = useRef<string>('')
  const offRoute = useRef(false)

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

  // Seguimiento GPS
  useEffect(() => {
    if (!active || simulating || !route || !user) return
    const loc = locateOnPolyline(route.geometry, [user.lat, user.lng])
    if (loc.distance < 60) {
      offRoute.current = false
      useAppStore.getState().setNavProgress(loc.offset)
    } else if (!offRoute.current) {
      // Un solo aviso por desvío (no en cada actualización del GPS).
      offRoute.current = true
      useAppStore.getState().notify('Te has desviado de la ruta.', 'info')
    }
  }, [active, simulating, route, user])

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
