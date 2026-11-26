import { haversine, polylineLength, type LatLngTuple } from '@/utils/distance'
import { projectOnSegment } from '@/utils/geometry'
import { connectedComponents } from './graph'
import type { GraphEdge, RoadGraph } from './routeTypes'

/**
 * Ajuste de una parada al PUNTO EXACTO de la calle más cercana (no al cruce más
 * cercano): se proyecta sobre el tramo y se parte con un nodo temporal, de modo que
 * la ruta sale de donde estás y en cualquier sentido permitido.
 */
export interface EdgeSnap {
  edge: GraphEdge
  segment: number
  t: number
  point: LatLngTuple
  distance: number
}

const componentCache = new WeakMap<RoadGraph, ReturnType<typeof connectedComponents>>()

export function nearestEdge(graph: RoadGraph, lat: number, lng: number): EdgeSnap | null {
  if (graph.edges.size === 0) return null
  let cc = componentCache.get(graph)
  if (!cc) componentCache.set(graph, (cc = connectedComponents(graph)))
  const largest = Math.max(...cc.sizes)
  // Ignora fragmentos aislados (trozos de vía desconectados del resto).
  const minSize = Math.min(largest, Math.max(2, Math.floor(largest * 0.05)))
  const p: LatLngTuple = [lat, lng]
  let best: EdgeSnap | null = null
  for (const edge of graph.edges.values()) {
    if (cc.sizes[cc.component.get(edge.from) ?? 0] < minSize) continue
    const g = edge.geometry
    // Poda barata: el tramo entero está más lejos que el mejor candidato.
    if (best && haversine(lat, lng, g[0][0], g[0][1]) - edge.distance > best.distance) continue
    for (let i = 1; i < g.length; i++) {
      const proj = projectOnSegment(p, g[i - 1], g[i])
      if (!best || proj.distance < best.distance) {
        best = { edge, segment: i - 1, t: proj.t, point: proj.point, distance: proj.distance }
      }
    }
  }
  return best
}

/** Parte una polilínea en el punto proyectado (segmento + punto). */
function splitGeometry(g: LatLngTuple[], segment: number, point: LatLngTuple): [LatLngTuple[], LatLngTuple[]] {
  return [
    [...g.slice(0, segment + 1), point],
    [point, ...g.slice(segment + 1)],
  ]
}

/** Arista gemela en sentido contrario (vías de doble sentido: `id:f` ↔ `id:r`). */
function twinOf(graph: RoadGraph, edge: GraphEdge): GraphEdge | undefined {
  const twinId = edge.id.endsWith(':f') ? edge.id.replace(/:f$/, ':r') : edge.id.replace(/:r$/, ':f')
  return twinId !== edge.id ? graph.edges.get(twinId) : undefined
}

/** Metros desde el punto proyectado hasta el extremo del tramo dentro del que cae. */
const ENDPOINT_TOLERANCE = 3

export interface VirtualStop {
  nodeId: string
  point: LatLngTuple
  /** Deshace los cambios temporales en el grafo. */
  remove: () => void
}

/**
 * Inserta un nodo temporal en el punto de la calle y aristas que lo conectan con los
 * extremos del tramo en los sentidos de circulación permitidos. Hay que llamar a
 * `remove()` al terminar (el grafo se comparte y se reutiliza).
 */
export function attachVirtualStop(graph: RoadGraph, snap: EdgeSnap, id: string): VirtualStop {
  const { edge, segment, point } = snap
  // Si cae prácticamente sobre un extremo, se usa ese nodo tal cual.
  const g = edge.geometry
  if (haversine(point[0], point[1], g[0][0], g[0][1]) < ENDPOINT_TOLERANCE) return { nodeId: edge.from, point, remove: () => {} }
  if (haversine(point[0], point[1], g[g.length - 1][0], g[g.length - 1][1]) < ENDPOINT_TOLERANCE) {
    return { nodeId: edge.to, point, remove: () => {} }
  }

  const added: string[] = []
  graph.nodes.set(id, { id, lat: point[0], lng: point[1], type: 'waypoint' })
  graph.outgoing.set(id, [])
  const add = (e: GraphEdge) => {
    graph.edges.set(e.id, e)
    graph.outgoing.get(e.from)!.push(e.id)
    added.push(e.id)
  }
  const split = (d: GraphEdge, seg: number) => {
    const [head, tail] = splitGeometry(d.geometry, seg, point)
    add({ ...d, id: `${d.id}~a~${id}`, to: id, geometry: head, distance: polylineLength(head) })
    add({ ...d, id: `${d.id}~b~${id}`, from: id, geometry: tail, distance: polylineLength(tail) })
  }
  split(edge, segment)
  const twin = twinOf(graph, edge)
  // La gemela recorre la misma geometría al revés: su segmento es el simétrico.
  if (twin) split(twin, twin.geometry.length - 2 - segment)

  return {
    nodeId: id,
    point,
    remove: () => {
      for (const eid of added) {
        const e = graph.edges.get(eid)
        if (!e) continue
        const out = graph.outgoing.get(e.from)
        if (out) graph.outgoing.set(e.from, out.filter((x) => x !== eid))
        graph.edges.delete(eid)
      }
      graph.outgoing.delete(id)
      graph.nodes.delete(id)
    },
  }
}
