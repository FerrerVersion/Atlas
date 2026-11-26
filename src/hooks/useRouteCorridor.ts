import { useEffect } from 'react'
import { getMapInstance } from '@/features/map/mapInstance'
import { holdLowPriority } from '@/features/osm/backgroundGate'
import { capBulk, prefetchTiles, themeTileUrls, tilesInBBox, type TileXYZ } from '@/features/map/tilePrefetch'
import {
  chunkSamples,
  corridorBoxes,
  loadCorridorRoads,
  sampleRoute,
  setCorridorProgress,
} from '@/features/osm/routeCorridor'
import type { MultiRoute } from '@/features/routing/routeTypes'
import { bboxOf } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { useMapTheme } from './useUiTheme'
import { useAppStore } from '@/store/useAppStore'

/** Espera tras tener la ruta: primero se dibuja la ruta y las teselas que se ven. */
const START_DELAY_MS = 800
/** Para elegir teselas se usa una línea más densa que para Overpass. */
const TILE_SAMPLE_STEP_M = 1_000

/** Teselas en 5 km alrededor de la ruta, en el orden del trayecto (zoom del encuadre y +1). */
export function corridorTiles(route: MultiRoute, fitZoom: number): TileXYZ[] {
  const boxes = corridorBoxes(sampleRoute(route.geometry, TILE_SAMPLE_STEP_M))
  const seen = new Set<string>()
  const out: TileXYZ[] = []
  for (const z of [fitZoom, fitZoom + 1]) {
    for (const box of boxes) {
      for (const t of tilesInBBox(box, z)) {
        const k = `${t.z}/${t.x}/${t.y}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push(t)
      }
    }
  }
  // Política de OSM: nunca más de 250 teselas de zoom ≥ 13 por adelantado.
  return capBulk(out)
}

/** Zoom con el que se encuadra la ruta (el que verá el usuario). */
function fitZoomFor(route: MultiRoute): number {
  const map = getMapInstance()
  const b = bboxOf(route.geometry.map(([lat, lng]) => ({ lat, lng })))
  const z = map
    ? map.getBoundsZoom(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        false,
      )
    : 12
  return Math.max(3, Math.min(17, Math.round(z)))
}

/**
 * Cuando la ruta ya está calculada, el mapa carga 5 km a su alrededor: carreteras
 * reales (Overpass, por tramos) y teselas del tema a lo largo del trayecto.
 */
export function useRouteCorridor() {
  const route = useAppStore((s) => (s.routeStatus === 'ready' ? s.route : null))
  const theme = useMapTheme()
  const showLabels = useAppStore((s) => s.showLabels)
  const base = theme.base
  const labels = showLabels ? theme.labels : undefined

  useEffect(() => {
    if (!route || route.geometry.length < 2) return
    const controller = new AbortController()
    // La zona de 200 km espera (y suelta la consulta en curso) hasta tener el corredor.
    const release = holdLowPriority()
    const t = setTimeout(async () => {
      const chunks = chunkSamples(sampleRoute(route.geometry)).length
      const urls = themeTileUrls([base, labels], corridorTiles(route, fitZoomFor(route)))
      let done = 0
      const tick = () => setCorridorProgress({ done: ++done })
      setCorridorProgress({ total: chunks + urls.length, done: 0, running: true })
      try {
        await Promise.all([
          loadCorridorRoads(route.geometry, controller.signal, tick),
          prefetchTiles(urls, { signal: controller.signal, onProgress: tick }),
        ])
      } catch (e) {
        if (!isAbortError(e)) console.warn('Corredor de la ruta:', e)
      } finally {
        release()
        if (!controller.signal.aborted) setCorridorProgress({ running: false })
      }
    }, START_DELAY_MS)
    return () => {
      release()
      clearTimeout(t)
      controller.abort()
      setCorridorProgress({ running: false })
    }
  }, [route, base, labels])
}
