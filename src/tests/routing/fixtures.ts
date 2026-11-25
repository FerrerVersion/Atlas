import { addNode, addRoad, createGraph } from '@/features/routing/graph'
import type { RoadGraph, RoadType } from '@/features/routing/routeTypes'
import type { LatLngTuple } from '@/utils/distance'

/**
 * Grafos sintéticos de prueba. Los nombres son etiquetas de test (A, B, C…),
 * no lugares reales.
 */
export function node(graph: RoadGraph, id: string, lat: number, lng: number) {
  addNode(graph, { id, lat, lng, type: 'intersection' })
}

export function road(
  graph: RoadGraph,
  id: string,
  from: string,
  to: string,
  opts: { speed?: number; oneWay?: boolean; type?: RoadType; name?: string; via?: LatLngTuple[]; roundabout?: boolean } = {},
) {
  const a = graph.nodes.get(from)!
  const b = graph.nodes.get(to)!
  addRoad(graph, {
    id,
    from,
    to,
    name: opts.name ?? id,
    speedLimit: opts.speed ?? 50,
    oneWay: opts.oneWay ?? false,
    roadType: opts.type ?? 'residential',
    roundabout: opts.roundabout,
    geometry: [[a.lat, a.lng], ...(opts.via ?? []), [b.lat, b.lng]],
  })
}

/**
 * Rejilla:  A — B — C
 *           |       |
 *           D ————— E   (D–E es recto pero lento; C–E da un rodeo)
 */
export function sampleGraph() {
  const g = createGraph()
  node(g, 'A', 0, 0)
  node(g, 'B', 0, 0.01)
  node(g, 'C', 0, 0.02)
  node(g, 'D', -0.01, 0)
  node(g, 'E', -0.01, 0.02)
  road(g, 'AB', 'A', 'B')
  road(g, 'BC', 'B', 'C')
  road(g, 'AD', 'A', 'D')
  road(g, 'DE', 'D', 'E', { speed: 20 })
  road(g, 'CE', 'C', 'E', { via: [[0.004, 0.03]] })
  return g
}
