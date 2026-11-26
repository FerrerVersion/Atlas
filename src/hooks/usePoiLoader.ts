import { useEffect } from 'react'
import { fetchPois } from '@/features/osm/overpassService'
import { POI_CATEGORY_MAP, type PoiCategory } from '@/features/poi/poiTypes'
import { bboxAround, bboxDiagonal, type BBox } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

/** Limita la zona consultada para no hacer peticiones excesivas a Overpass. */
function clampBBox(b: BBox, maxRadius: number): BBox {
  if (bboxDiagonal(b) / 2 <= maxRadius) return b
  return bboxAround((b.south + b.north) / 2, (b.west + b.east) / 2, maxRadius)
}

const snap = (b: BBox) => {
  const r = (n: number) => Math.round(n * 200) / 200
  return { south: r(b.south) - 0.005, west: r(b.west) - 0.005, north: r(b.north) + 0.005, east: r(b.east) + 0.005 }
}

/** Descarga POIs reales de OSM para las categorías activas en la vista actual. */
export function usePoiLoader() {
  const categoriesKey = useAppStore((s) => s.activeCategories.join(','))
  // Clave estable de la zona (redondeada) para no repetir consultas al mover poco el mapa.
  const viewKey = useAppStore((s) => (s.viewBBox ? JSON.stringify(snap(s.viewBBox)) : ''))

  useEffect(() => {
    const { setPois, notify } = useAppStore.getState()
    const categories = categoriesKey ? (categoriesKey.split(',') as PoiCategory[]) : []
    const view = viewKey ? (JSON.parse(viewKey) as BBox) : null
    if (categories.length === 0 || !view) {
      setPois([], 'idle')
      return
    }
    const radius = Math.max(...categories.map((c) => POI_CATEGORY_MAP[c].searchRadius))
    const box = clampBBox(view, radius)
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setPois(useAppStore.getState().pois, 'loading')
      try {
        const pois = await fetchPois(categories, box, controller.signal)
        setPois(pois, 'idle')
        if (pois.length === 0) notify('No hay puntos de interés de esa categoría en OSM para esta zona.')
      } catch (e) {
        if (isAbortError(e)) return
        setPois(useAppStore.getState().pois, 'error')
        notify((e as Error).message, 'error')
      }
    }, 400)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [categoriesKey, viewKey])
}
