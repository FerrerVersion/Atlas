import { useMemo } from 'react'
import { Circle, Marker } from 'react-leaflet'
import { userIcon } from '@/features/map/mapUtils'
import { useNavStore } from '@/store/useNavStore'
import { smoothLocation, useSmooth } from '@/features/navigation/smoothMotion'

/**
 * Posición GPS fuera de la navegación (punto azul con su precisión). Durante la
 * navegación la flecha la dibuja la cámara (NavigationCamera), que la mueve y la orienta
 * en el mismo fotograma que el mapa.
 */
export function UserMarker() {
  const user = useNavStore((s) => s.userLocation)
  const active = useNavStore((s) => s.navigation.active)
  const dotIcon = useMemo(() => userIcon(false), [])
  // Posición suavizada fotograma a fotograma (sin saltos entre lecturas del GPS).
  const locationNow = useSmooth(smoothLocation)
  const dot: [number, number] | null = locationNow ? [locationNow[0], locationNow[1]] : user ? [user.lat, user.lng] : null
  if (!user || !dot || active) return null
  return (
    <>
      <Circle center={dot} radius={user.accuracy} interactive={false} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
      <Marker position={dot} icon={dotIcon} interactive={false} keyboard={false} />
    </>
  )
}
