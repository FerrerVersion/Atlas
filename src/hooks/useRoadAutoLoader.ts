import { useEffect } from 'react'
import { cellsForBBox, networkStore } from '@/features/osm/networkStore'
import { fetchRoadNetwork } from '@/features/osm/overpassService'
import { bboxOf, type BBox } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

export const AUTOLOAD_MIN_ZOOM = 15
const MAX_CELLS = 9

/** Descarga las celdas de red viaria que faltan para una zona (máx. 9 celdas ≈ 4,5 km). */
export async function loadRoadsForBBox(view: BBox, signal?: AbortSignal) {
  const missing = cellsForBBox(view).filter((c) => !networkStore.hasCell(c.key)).slice(0, MAX_CELLS)
  if (missing.length === 0) return 0
  const corners = missing.flatMap((c) => [
    { lat: c.bbox.south, lng: c.bbox.west },
    { lat: c.bbox.north, lng: c.bbox.east },
  ])
  const ways = await fetchRoadNetwork({ detail: [bboxOf(corners)] }, signal)
  networkStore.addWays(ways)
  networkStore.markCells(missing.map((c) => c.key))
  networkStore.addCoverage(missing.map((c) => c.bbox))
  return ways.length
}

/** Carga automáticamente las calles reales al acercarse (zoom ≥ 15). */
export function useRoadAutoLoader() {
  const zoomedIn = useAppStore((s) => s.lastView.zoom >= AUTOLOAD_MIN_ZOOM)
  const enabled = useAppStore((s) => s.autoLoadRoads)
  // Clave = celdas visibles: solo se reacciona cuando cambian.
  const key = useAppStore((s) => (s.viewBBox ? cellsForBBox(s.viewBBox).map((c) => c.key).join('|') : ''))

  useEffect(() => {
    const view = useAppStore.getState().viewBBox
    if (!enabled || !view || !zoomedIn || !key) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      const { setRoadsStatus } = useAppStore.getState()
      setRoadsStatus('loading')
      try {
        await loadRoadsForBBox(view, controller.signal)
        setRoadsStatus('idle')
      } catch (e) {
        if (isAbortError(e)) return
        setRoadsStatus('error')
      }
    }, 400)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [key, enabled, zoomedIn])
}
