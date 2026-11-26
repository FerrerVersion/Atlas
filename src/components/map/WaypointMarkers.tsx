import { useMemo } from 'react'
import { Marker, Polyline, Tooltip } from 'react-leaflet'
import type { LeafletEvent, Marker as LMarker } from 'leaflet'
import { placeFromMap, pointPlace } from '@/features/geocoding/placeFromMap'
import { waypointIcon } from '@/features/map/mapUtils'
import type { MapTheme } from '@/features/themes/themeTypes'
import { useAppStore } from '@/store/useAppStore'

/** Marcadores de origen, paradas y destino (arrastrables). */
export function WaypointMarkers({ theme }: { theme: MapTheme }) {
  const waypoints = useAppStore((s) => s.waypoints)
  const route = useAppStore((s) => s.route)
  const setWaypoint = useAppStore((s) => s.setWaypoint)
  const last = waypoints.length - 1

  const icons = useMemo(
    () =>
      waypoints.map((_, i) =>
        waypointIcon(theme, i === 0 ? 'A' : i === last ? 'B' : String(i), i === 0 ? 'origin' : i === last ? 'destination' : 'stop'),
      ),
    [theme, waypoints, last],
  )

  return (
    <>
      {waypoints.map((w, i) => {
        if (!w.place) return null
        const snap = route?.snapped[waypoints.slice(0, i).filter((x) => x.place).length]
        return (
          <span key={w.id}>
            {/* Acceso desde el punto elegido hasta la vía más cercana (no forma parte de la ruta). */}
            {snap && snap.offsetMeters > 15 && (
              <Polyline
                positions={[
                  [w.place.lat, w.place.lng],
                  [snap.lat, snap.lng],
                ]}
                interactive={false}
                pathOptions={{ color: theme.route.color, weight: 2, dashArray: '2 6', opacity: 0.8 }}
              />
            )}
            <Marker
              position={[w.place.lat, w.place.lng]}
              icon={icons[i]}
              draggable
              autoPan
              keyboard
              title={w.place.name}
              eventHandlers={{
                dragend: (e: LeafletEvent) => {
                  const ll = (e.target as LMarker).getLatLng()
                  // Recalcula al instante; el nombre real se rellena cuando llega.
                  setWaypoint(i, pointPlace(ll.lat, ll.lng))
                  placeFromMap(ll.lat, ll.lng).then((named) => useAppStore.getState().updatePlace(named))
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -30]}>
                {w.place.name}
              </Tooltip>
            </Marker>
          </span>
        )
      })}
    </>
  )
}
