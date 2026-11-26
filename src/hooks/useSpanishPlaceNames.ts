import { useEffect } from 'react'
import { needsSpanishName, resolveSpanishName, type Place } from '@/features/geocoding/geocodingService'
import { useAppStore } from '@/store/useAppStore'

/**
 * Al elegir un municipio, región o país del autocompletado (Photon, que solo da el
 * nombre oficial local, p. ej. «València»), se consulta una vez su nombre en español
 * de OSM y se actualiza el lugar elegido y las paradas que lo usan (sin moverlas).
 */
export function useSpanishPlaceNames() {
  const selected = useAppStore((s) => s.selectedPlace)
  const waypoints = useAppStore((s) => s.waypoints)
  useEffect(() => {
    const pending = new Map<string, Place>()
    for (const p of [selected, ...waypoints.map((w) => w.place)]) if (p && needsSpanishName(p)) pending.set(p.id, p)
    for (const p of pending.values()) {
      resolveSpanishName(p)
        .then((named) => {
          if (named.name !== p.name) useAppStore.getState().updatePlace(named)
        })
        .catch(() => undefined)
    }
  }, [selected, waypoints])
}
