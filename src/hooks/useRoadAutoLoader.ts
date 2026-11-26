import { useEffect } from 'react'
import { ensureRoadCells } from '@/features/osm/cellLoader'
import { cellsForBBox } from '@/features/osm/networkStore'
import type { BBox } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

export const AUTOLOAD_MIN_ZOOM = 15
/** Descarga las celdas de calles que faltan en la zona visible (máx. 9 celdas ≈ 4,5 km). */
export const loadRoadsForBBox = (view: BBox, signal?: AbortSignal) => ensureRoadCells(view, { maxCells: 9, signal })

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
