import { useEffect } from 'react'
import { networkStore } from '@/features/osm/networkStore'
import { OverpassError } from '@/features/osm/overpassService'
import { computeMultiRoute, prefetchAround, RouteError } from '@/features/routing/routeService'
import { isAbortError } from '@/utils/http'
import { filledWaypoints, useAppStore } from '@/store/useAppStore'

/**
 * Recalcula la ruta cuando cambian las paradas o las preferencias de navegación.
 * No depende del tema visual: cambiar de estilo nunca dispara un recálculo.
 */
export function useRouteComputation() {
  const waypoints = useAppStore((s) => s.waypoints)
  const navPrefs = useAppStore((s) => s.navPrefs)

  const key = JSON.stringify({
    pts: waypoints.map((w) => (w.place ? [w.place.lat.toFixed(6), w.place.lng.toFixed(6)] : null)),
    p: [navPrefs.profile, navPrefs.cost, navPrefs.avoidHighways],
  })

  // Precarga: en cuanto se elige una parada se empiezan a bajar sus calles, sin
  // esperar a tener la ruta completa (el cálculo luego las encuentra listas).
  const pointsKey = waypoints.map((w) => (w.place ? `${w.place.lat.toFixed(5)},${w.place.lng.toFixed(5)}` : '')).join('|')
  useEffect(() => {
    const controller = new AbortController()
    const { navPrefs } = useAppStore.getState()
    for (const p of filledWaypoints(useAppStore.getState().waypoints)) {
      prefetchAround(p, navPrefs.profile, controller.signal).catch(() => undefined)
    }
    return () => controller.abort()
  }, [pointsKey])

  useEffect(() => {
    const { setRoute, requestFitRoute, notify } = useAppStore.getState()
    const places = filledWaypoints(useAppStore.getState().waypoints)
    if (places.length < 2) {
      setRoute(null, 'idle')
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setRoute(useAppStore.getState().route, 'loading', 'Preparando ruta…')
      const prefs = useAppStore.getState().navPrefs
      const onStatus = (m: string) => setRoute(useAppStore.getState().route, 'loading', m)
      try {
        let route
        try {
          route = await computeMultiRoute(places, prefs, { signal: controller.signal, onStatus })
        } catch (e) {
          // Sin conexión con Overpass: intenta con los datos ya cargados (p. ej. demo offline).
          if (e instanceof OverpassError && networkStore.size > 0) {
            notify('Overpass no responde: se usan los datos ya cargados.', 'info')
            route = await computeMultiRoute(places, prefs, { signal: controller.signal, onStatus, download: false })
          } else throw e
        }
        if (controller.signal.aborted) return
        setRoute(route, 'ready')
        requestFitRoute()
      } catch (e) {
        if (isAbortError(e) || controller.signal.aborted) return
        const msg =
          e instanceof RouteError || e instanceof OverpassError
            ? e.message
            : 'No se ha podido calcular la ruta por un error inesperado.'
        if (!(e instanceof RouteError) && !(e instanceof OverpassError)) console.error(e)
        setRoute(null, 'error', msg)
      }
    }, 120)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key])
}
