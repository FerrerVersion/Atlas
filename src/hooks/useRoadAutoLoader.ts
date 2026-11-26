import { useEffect } from 'react'
import { ensureRoadCells } from '@/features/osm/cellLoader'
import { cellsForBBox } from '@/features/osm/networkStore'
import { expandBBox, type BBox } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

export const AUTOLOAD_MIN_ZOOM = 15
/** Descarga las celdas de calles que faltan en la zona visible (máx. 9 celdas ≈ 4,5 km). */
export const loadRoadsForBBox = (view: BBox, signal?: AbortSignal) => ensureRoadCells(view, { maxCells: 9, signal })

/** La carga automática cubre lo visible y un margen alrededor (al moverse ya está). */
export const AUTOLOAD_MARGIN_M = 600

/** Carga automáticamente las calles reales al acercarse (zoom ≥ 15). */
export function useRoadAutoLoader() {
  const zoomedIn = useAppStore((s) => s.lastView.zoom >= AUTOLOAD_MIN_ZOOM)
  const enabled = useAppStore((s) => s.autoLoadRoads)
  // Clave = celdas de la zona con margen: solo se reacciona cuando cambian.
  const key = useAppStore((s) =>
    s.viewBBox ? cellsForBBox(expandBBox(s.viewBBox, AUTOLOAD_MARGIN_M)).map((c) => c.key).join('|') : '',
  )

  useEffect(() => {
    const view = useAppStore.getState().viewBBox
    if (!enabled || !view || !zoomedIn || !key) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      const { setRoadsStatus } = useAppStore.getState()
      setRoadsStatus('loading')
      try {
        // Primero lo visible y después el margen alrededor (al moverse ya estará).
        await loadRoadsForBBox(view, controller.signal)
        setRoadsStatus('idle')
        await ensureRoadCells(expandBBox(view, AUTOLOAD_MARGIN_M), { maxCells: 16, signal: controller.signal })
      } catch (e) {
        if (isAbortError(e)) return
        setRoadsStatus('error')
      }
    }, 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [key, enabled, zoomedIn])
}
