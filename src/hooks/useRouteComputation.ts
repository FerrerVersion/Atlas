import { useEffect } from 'react'
import { setBackgroundPaused } from '@/features/osm/backgroundGate'
import { networkStore } from '@/features/osm/networkStore'
import { OverpassError } from '@/features/osm/overpassService'
import { computeMultiRoute, prefetchAround, RouteError } from '@/features/routing/routeService'
import type { MultiRoute } from '@/features/routing/routeTypes'
import { isAbortError } from '@/utils/http'
import { filledWaypoints, useAppStore } from '@/store/useAppStore'

/**
 * Mientras se calcula una ruta, la app se centra solo en ella: se pausan la precarga
 * regional, el corredor, la carga de calles al mover el mapa y los POIs.
 */
function useRouteFocus() {
  const computing = useAppStore((s) => s.routeStatus === 'loading')
  useEffect(() => {
    setBackgroundPaused(computing)
  }, [computing])
  useEffect(() => () => setBackgroundPaused(false), [])
}

/**
 * Recalcula la ruta cuando cambian las paradas o las preferencias de navegación.
 * No depende del tema visual: cambiar de estilo nunca dispara un recálculo.
 */
export function useRouteComputation() {
  const waypoints = useAppStore((s) => s.waypoints)
  const navPrefs = useAppStore((s) => s.navPrefs)
  useRouteFocus()

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
      // El mapa se centra en el trayecto desde el primer momento (no al terminar).
      if (!useAppStore.getState().navigation.active) requestFitRoute(places.map((p) => [p.lat, p.lng]))
      const prefs = useAppStore.getState().navPrefs
      const onStatus = (m: string) => setRoute(useAppStore.getState().route, 'loading', m)
      // Ruta provisional: se muestra (y se encuadra) en cuanto hay una válida.
      let provisional: MultiRoute | null = null
      const onProvisional = (r: MultiRoute) => {
        if (controller.signal.aborted) return
        provisional = r
        setRoute(r, 'loading', 'Ruta lista · afinando con más datos…')
        requestFitRoute()
      }
      try {
        let route
        try {
          route = await computeMultiRoute(places, prefs, { signal: controller.signal, onStatus, onProvisional })
        } catch (e) {
          // Sin conexión con Overpass: intenta con los datos ya cargados (p. ej. demo offline).
          if (e instanceof OverpassError && networkStore.size > 0) {
            notify('Overpass no responde: se usan los datos ya cargados.', 'info')
            route = await computeMultiRoute(places, prefs, { signal: controller.signal, onStatus, download: false })
          } else throw e
        }
        if (controller.signal.aborted) return
        setRoute(route, 'ready')
        if (!provisional) requestFitRoute()
      } catch (e) {
        if (isAbortError(e) || controller.signal.aborted) return
        // Si ya había una ruta válida y falla solo el afinado, se conserva esa ruta.
        if (provisional && e instanceof OverpassError) {
          setRoute(provisional, 'ready')
          notify('No se pudieron descargar todos los datos: ruta calculada con los disponibles.', 'info')
          return
        }
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
