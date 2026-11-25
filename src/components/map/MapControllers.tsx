import { useCallback, useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { navigationState } from '@/features/navigation/navigationProgress'
import { setMapInstance } from '@/features/map/mapInstance'
import { prefersReducedMotion } from '@/features/map/mapUtils'
import { useMediaQuery } from '@/hooks/useUiTheme'
import { useAppStore } from '@/store/useAppStore'

/** Padding para que el panel lateral/inferior no tape la zona de interés. */
function usePanelPadding() {
  const desktop = useMediaQuery('(min-width: 768px)')
  const ref = useRef(desktop)
  useEffect(() => {
    ref.current = desktop
  }, [desktop])
  // Se lee en el momento de animar, sin forzar nuevas animaciones al redimensionar.
  return useCallback(
    () =>
      ref.current
        ? { paddingTopLeft: L.point(440, 60), paddingBottomRight: L.point(80, 60) }
        : { paddingTopLeft: L.point(30, 110), paddingBottomRight: L.point(30, 220) },
    [],
  )
}

/** Publica la instancia del mapa y sincroniza vista ↔ store. */
export function MapSync() {
  const map = useMap()
  const setLastView = useAppStore((s) => s.setLastView)
  const setViewBBox = useAppStore((s) => s.setViewBBox)

  useEffect(() => {
    setMapInstance(map)
    const b = map.getBounds()
    setViewBBox({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() })
    return () => setMapInstance(null)
  }, [map, setViewBBox])

  useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      const b = map.getBounds()
      setLastView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
      setViewBBox({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() })
    },
  })
  return null
}

/** Centra el mapa en el destino solicitado (búsquedas, favoritos, GPS). */
export function MapTargetController() {
  const map = useMap()
  const target = useAppStore((s) => s.mapTarget)
  const padding = usePanelPadding()

  useEffect(() => {
    if (!target) return
    const animate = !prefersReducedMotion()
    const b = target.bbox
    if (b && Number.isFinite(b.south) && b.north - b.south > 0.002 && b.north - b.south < 3) {
      map.flyToBounds(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        { ...padding(), maxZoom: target.zoom ?? 17, animate, duration: 1.1 },
      )
    } else {
      map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 15), { animate, duration: 1.1 })
    }
    // `target` cambia de identidad solo con cada petición nueva.
  }, [map, target, padding])
  return null
}

/** Ajusta el zoom para mostrar la ruta completa. */
export function FitRouteController() {
  const map = useMap()
  const nonce = useAppStore((s) => s.fitRouteNonce)
  const padding = usePanelPadding()
  useEffect(() => {
    const route = useAppStore.getState().route
    if (!nonce || !route || route.geometry.length < 2) return
    map.flyToBounds(L.latLngBounds(route.geometry), { ...padding(), maxZoom: 17, animate: !prefersReducedMotion(), duration: 0.9 })
  }, [map, nonce, padding])
  return null
}

/** Sigue la posición durante la navegación. */
export function NavigationFollow() {
  const map = useMap()
  const nav = useAppStore((s) => s.navigation)
  const route = useAppStore((s) => s.route)
  const lastPan = useRef(0)
  const setNavFlags = useAppStore((s) => s.setNavFlags)

  useMapEvents({
    dragstart: () => {
      if (useAppStore.getState().navigation.active) setNavFlags({ following: false })
    },
  })

  useEffect(() => {
    if (!nav.active || !nav.following || !route) return
    const now = performance.now()
    if (now - lastPan.current < 250) return
    lastPan.current = now
    const pos = navigationState(route, nav.progress).position
    if (map.getZoom() < 16) map.setView(pos, 17, { animate: true })
    else map.panTo(pos, { animate: true, duration: 0.25, easeLinearity: 1 })
  }, [map, nav.active, nav.following, nav.progress, route])
  return null
}
