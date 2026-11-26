import { useMemo } from 'react'
import { Circle, Marker } from 'react-leaflet'
import { navigationState } from '@/features/navigation/navigationProgress'
import { userIcon } from '@/features/map/mapUtils'
import { bearing } from '@/utils/distance'
import { pointAlong } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'

/** Posición real del usuario (GPS) o posición simulada durante la navegación. */
export function UserMarker() {
  const user = useAppStore((s) => s.userLocation)
  const nav = useAppStore((s) => s.navigation)
  const route = useAppStore((s) => s.route)
  const dotIcon = useMemo(() => userIcon(false), [])

  const navPos = nav.active && route ? navigationState(route, nav.progress).position : null
  // Rumbo de la ruta en la posición actual (más estable que el del GPS a poca velocidad).
  let heading = 0
  if (navPos && route) {
    const ahead = pointAlong(route.geometry, Math.min(nav.progress + 15, route.distance))
    if (ahead[0] !== navPos[0] || ahead[1] !== navPos[1]) heading = bearing(navPos[0], navPos[1], ahead[0], ahead[1])
  }
  const headingBucket = Math.round(heading / 5) * 5
  const navIcon = useMemo(() => userIcon(true, headingBucket), [headingBucket])
  return (
    <>
      {user && !navPos && (
        <>
          <Circle
            center={[user.lat, user.lng]}
            radius={user.accuracy}
            interactive={false}
            pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }}
          />
          <Marker position={[user.lat, user.lng]} icon={dotIcon} interactive={false} keyboard={false} />
        </>
      )}
      {navPos && <Marker position={navPos} icon={navIcon} interactive={false} keyboard={false} zIndexOffset={2000} />}
    </>
  )
}
