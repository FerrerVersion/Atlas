import { useMemo } from 'react'
import { Circle, Marker } from 'react-leaflet'
import { navigationState } from '@/features/navigation/navigationProgress'
import { userIcon } from '@/features/map/mapUtils'
import { bearing } from '@/utils/distance'
import { pointAlong } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { smoothLocation, smoothProgress, useSmooth } from '@/features/navigation/smoothMotion'

/** Posición real del usuario (GPS) o posición simulada durante la navegación. */
export function UserMarker() {
  const user = useNavStore((s) => s.userLocation)
  const active = useNavStore((s) => s.navigation.active)
  const route = useAppStore((s) => s.route)
  const dotIcon = useMemo(() => userIcon(false), [])
  // Posiciones suavizadas fotograma a fotograma (sin saltos entre lecturas del GPS).
  const progressNow = useSmooth(smoothProgress)
  const locationNow = useSmooth(smoothLocation)

  const progress = progressNow?.[0] ?? 0
  const navPos = active && route && progressNow ? navigationState(route, progress).position : null
  // Rumbo de la ruta en la posición actual (más estable que el del GPS a poca velocidad).
  let heading = 0
  if (navPos && route) {
    const ahead = pointAlong(route.geometry, Math.min(progress + 15, route.distance))
    if (ahead[0] !== navPos[0] || ahead[1] !== navPos[1]) heading = bearing(navPos[0], navPos[1], ahead[0], ahead[1])
  }
  const headingBucket = Math.round(heading / 5) * 5
  const navIcon = useMemo(() => userIcon(true, headingBucket), [headingBucket])
  const dot: [number, number] | null = locationNow ? [locationNow[0], locationNow[1]] : user ? [user.lat, user.lng] : null
  return (
    <>
      {user && dot && !navPos && (
        <>
          <Circle center={dot} radius={user.accuracy} interactive={false} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
          <Marker position={dot} icon={dotIcon} interactive={false} keyboard={false} />
        </>
      )}
      {navPos && <Marker position={navPos} icon={navIcon} interactive={false} keyboard={false} zIndexOffset={2000} />}
    </>
  )
}
