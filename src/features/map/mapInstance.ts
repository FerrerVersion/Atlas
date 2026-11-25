import { useSyncExternalStore } from 'react'
import type { Map as LeafletMap } from 'leaflet'

/** Referencia compartida al mapa Leaflet para los controles flotantes externos. */
let current: LeafletMap | null = null
const listeners = new Set<() => void>()

export function setMapInstance(map: LeafletMap | null) {
  current = map
  listeners.forEach((l) => l())
}

export const getMapInstance = () => current

export function useMapInstance() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => current,
  )
}
