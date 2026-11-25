import { useMemo } from 'react'
import { Polyline } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import type { MapTheme } from '@/features/themes/themeTypes'
import { sliceAlong } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'

/**
 * Ruta dibujada exactamente sobre la geometría de las vías recorridas.
 * Durante la navegación, el tramo ya recorrido se atenúa.
 */
export function RouteLayer({ theme }: { theme: MapTheme }) {
  const route = useAppStore((s) => s.route)
  const nav = useAppStore((s) => s.navigation)
  const positions = useMemo(() => (route?.geometry ?? []) as LatLngTuple[], [route])

  const traveled = useMemo(
    () => (route && nav.active && nav.progress > 0 ? (sliceAlong(route.geometry, nav.progress) as LatLngTuple[]) : null),
    [route, nav.active, nav.progress],
  )

  if (positions.length < 2) return null
  const r = theme.route
  const lineClass = ['route-line', r.animated ? 'route-animated' : '', r.glow ? 'route-glow' : ''].join(' ')
  return (
    <>
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{ color: r.casing, weight: r.width + 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
      />
      <Polyline
        // className solo se aplica al crear la capa: se remonta al cambiar de tema.
        key={`${theme.id}-${lineClass}`}
        className={lineClass}
        positions={positions}
        interactive={false}
        pathOptions={{
          color: r.color,
          weight: r.width,
          opacity: 1,
          dashArray: r.dash,
          lineCap: theme.marker.shape === 'pixel' ? 'square' : 'round',
          lineJoin: 'round',
        }}
      />
      {traveled && traveled.length > 1 && (
        <Polyline
          className="route-progress"
          positions={traveled}
          interactive={false}
          pathOptions={{ color: '#64748b', weight: r.width + 1, opacity: 0.8, lineCap: 'round' }}
        />
      )}
    </>
  )
}
