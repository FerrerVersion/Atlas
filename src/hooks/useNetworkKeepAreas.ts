import { useEffect } from 'react'
import { networkStore } from '@/features/osm/networkStore'
import { bboxAround, expandBBox } from '@/utils/geometry'
import { filledWaypoints, useAppStore } from '@/store/useAppStore'

/** Margen alrededor de la vista y radio alrededor de cada parada que nunca se liberan de memoria. */
export const KEEP_VIEW_MARGIN_M = 2_000
export const KEEP_STOP_RADIUS_M = 3_000

/**
 * Informa a la red cargada de qué zonas está usando el usuario (lo que ve y sus
 * paradas): al liberar memoria, esas vías se conservan.
 */
export function useNetworkKeepAreas() {
  const view = useAppStore((s) => s.viewBBox)
  const waypoints = useAppStore((s) => s.waypoints)
  useEffect(() => {
    const boxes = filledWaypoints(waypoints).map((p) => bboxAround(p.lat, p.lng, KEEP_STOP_RADIUS_M))
    if (view) boxes.push(expandBBox(view, KEEP_VIEW_MARGIN_M))
    networkStore.setKeepAreas(boxes)
  }, [view, waypoints])
}
