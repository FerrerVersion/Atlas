import { useMemo } from 'react'
import { Circle, Marker } from 'react-leaflet'
import { navigationState } from '@/features/navigation/navigationProgress'
import { userIcon } from '@/features/map/mapUtils'
import { useAppStore } from '@/store/useAppStore'

/** Posición real del usuario (GPS) o posición simulada durante la navegación. */
export function UserMarker() {
  const user = useAppStore((s) => s.userLocation)
  const nav = useAppStore((s) => s.navigation)
  const route = useAppStore((s) => s.route)
  const navIcon = useMemo(() => userIcon(true), [])
  const dotIcon = useMemo(() => userIcon(false), [])

  const navPos = nav.active && route ? navigationState(route, nav.progress).position : null
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
