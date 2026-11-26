import { useEffect, useSyncExternalStore } from 'react'
import { prefetchTiles, REGION_ZOOMS, sortByDistance, themeTileUrls, tilesInBBox, type PrefetchProgress } from '@/features/map/tilePrefetch'
import { loadRegionalRoads, REGION_RADIUS_M } from '@/features/osm/regionalRoads'
import { bboxAround } from '@/utils/geometry'
import { haversine } from '@/utils/distance'
import { isAbortError } from '@/utils/http'
import { useMapTheme } from './useUiTheme'
import { useAppStore } from '@/store/useAppStore'

/** Si el usuario se aleja más de esto del centro precargado, se precarga la nueva zona. */
export const REGION_RECENTER_M = 50_000
/** Espera tras tener la ubicación: primero se cargan las teselas de la pantalla. */
const START_DELAY_MS = 1_500
const DONE_TTL = 7 * 24 * 3600 * 1000
const DONE_PREFIX = 'atlas-nav:region-tiles:'

/* Progreso de las teselas regionales (para el indicador). */
let tileProgress: PrefetchProgress & { running: boolean } = { done: 0, total: 0, running: false }
const listeners = new Set<() => void>()
function setTileProgress(p: Partial<typeof tileProgress>) {
  tileProgress = { ...tileProgress, ...p }
  listeners.forEach((l) => l())
}
export const useRegionTileProgress = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => tileProgress,
    () => tileProgress,
  )

function recentlyDone(key: string) {
  try {
    const t = Number(localStorage.getItem(DONE_PREFIX + key))
    return Number.isFinite(t) && Date.now() - t < DONE_TTL
  } catch {
    return false
  }
}
function markDone(key: string) {
  try {
    localStorage.setItem(DONE_PREFIX + key, String(Date.now()))
  } catch {
    /* sin almacenamiento */
  }
}

/** Centro de la precarga: la primera ubicación, y se mueve solo al alejarse mucho. */
let regionCenter: { lat: number; lng: number } | null = null
export function regionCenterFor(loc: { lat: number; lng: number } | null) {
  if (loc && (!regionCenter || haversine(regionCenter.lat, regionCenter.lng, loc.lat, loc.lng) > REGION_RECENTER_M)) {
    regionCenter = { lat: loc.lat, lng: loc.lng }
  }
  return regionCenter
}
// Mismo objeto mientras no se aleje: las lecturas del GPS no relanzan la precarga.
const useRegionCenter = () => useAppStore((s) => regionCenterFor(s.userLocation))

/**
 * Al conceder la ubicación, carga el mapa (con el tema elegido) en 200 km alrededor:
 *  - autopistas y autovías reales en vectorial, dibujadas con el estilo del tema;
 *  - teselas del tema en los zooms regionales (5-10, ~300 por capa).
 * Todo en segundo plano y en pausa mientras se calcula una ruta.
 */
export function useRegionalPreload() {
  const center = useRegionCenter()
  const theme = useMapTheme()
  const showLabels = useAppStore((s) => s.showLabels)

  // Carreteras: no dependen del tema.
  useEffect(() => {
    if (!center) return
    const controller = new AbortController()
    const t = setTimeout(() => {
      loadRegionalRoads(center.lat, center.lng, controller.signal).catch((e) => {
        if (!isAbortError(e)) console.warn('Precarga regional:', e)
      })
    }, START_DELAY_MS)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [center])

  // Teselas: dependen del tema (cada tema usa sus propios proveedores).
  const layers = [theme.base, showLabels ? theme.labels : undefined]
  const layersKey = JSON.stringify(layers.map((l) => (l ? [l.provider, !!l.pixelated] : null)))
  useEffect(() => {
    if (!center) return
    const key = `${layersKey}@${center.lat.toFixed(1)},${center.lng.toFixed(1)}`
    if (recentlyDone(key)) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      const box = bboxAround(center.lat, center.lng, REGION_RADIUS_M)
      const tiles = sortByDistance(REGION_ZOOMS.flatMap((z) => tilesInBBox(box, z)), center.lat, center.lng)
      const urls = themeTileUrls(layers, tiles)
      setTileProgress({ done: 0, total: urls.length, running: true })
      try {
        await prefetchTiles(urls, { signal: controller.signal, low: true, onProgress: (p) => setTileProgress(p) })
        markDone(key)
      } catch (e) {
        if (!isAbortError(e)) console.warn('Precarga de teselas:', e)
      } finally {
        setTileProgress({ running: false })
      }
    }, START_DELAY_MS)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
    // `layers` deriva de `layersKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, layersKey])
}
