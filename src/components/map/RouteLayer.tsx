import { useMemo } from 'react'
import { Polyline } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import type { MapTheme } from '@/features/themes/themeTypes'
import { sliceAlong } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/**
 * Ruta dibujada exactamente sobre la geometría de las vías recorridas.
 * Durante la navegación, el tramo ya recorrido se atenúa.
 */
export function RouteLayer({ theme }: { theme: MapTheme }) {
  const route = useAppStore((s) => s.route)
  const navActive = useNavStore((s) => s.navigation.active)
  // Solo durante la navegación interesa el avance (fuera de ella no provoca repintados).
  const navProgress = useNavStore((s) => (s.navigation.active ? s.navigation.progress : 0))
  const positions = useMemo(() => (route?.geometry ?? []) as LatLngTuple[], [route])

  const traveled = useMemo(
    () => (route && navActive && navProgress > 0 ? (sliceAlong(route.geometry, navProgress) as LatLngTuple[]) : null),
    [route, navActive, navProgress],
  )

  if (positions.length < 2) return null
  const r = theme.route
  // La ruta «animada» se detiene durante la navegación: el marcador ya indica el
  // movimiento y una animación continua obliga a repintar la ruta en cada fotograma.
  const lineClass = ['route-line', r.animated && !navActive ? 'route-animated' : ''].join(' ')
  return (
    <>
      {r.glow && (
        // Resplandor: línea ancha y translúcida debajo (antes, filtros CSS drop-shadow).
        <Polyline
          positions={positions}
          interactive={false}
          pathOptions={{ color: r.color, weight: r.width + 16, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }}
        />
      )}
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
