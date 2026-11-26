import { haversine, polylineLength, type LatLngTuple } from '@/utils/distance'
import { projectOnSegment } from '@/utils/geometry'
import { componentsOf } from './graph'
import { cellKey, type GraphEdge, type RoadGraph } from './routeTypes'

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

/** Radio máximo (en celdas del índice) que se recorre antes de pasar a la búsqueda completa. */
const MAX_INDEX_RINGS = 6

export function nearestEdge(graph: RoadGraph, lat: number, lng: number): EdgeSnap | null {
  if (graph.edges.size === 0) return null
  const cc = componentsOf(graph)
  const largest = Math.max(...cc.sizes)
  // Ignora fragmentos aislados (trozos de vía desconectados del resto).
  const minSize = Math.min(largest, Math.max(2, Math.floor(largest * 0.05)))
  const p: LatLngTuple = [lat, lng]
  let best: EdgeSnap | null = null
  const consider = (edge: GraphEdge) => {
    if (cc.sizes[cc.component.get(edge.from) ?? 0] < minSize) return
    const g = edge.geometry
    // Poda barata: el tramo entero está más lejos que el mejor candidato.
    if (best && haversine(lat, lng, g[0][0], g[0][1]) - edge.distance > best.distance) return
    for (let i = 1; i < g.length; i++) {
      const proj = projectOnSegment(p, g[i - 1], g[i])
      if (!best || proj.distance < best.distance) {
        best = { edge, segment: i - 1, t: proj.t, point: proj.point, distance: proj.distance }
      }
    }
  }

  // Con índice espacial: se miran las celdas en anillos crecientes alrededor del punto
  // y se para en cuanto ningún anillo más lejano puede tener nada más cerca.
  const index = graph.index
  if (index && index.cells.size > 0) {
    const d = index.cellDeg
    const ci = Math.floor(lat / d)
    const cj = Math.floor(lng / d)
    // Lado más corto de una celda en metros (en longitud se encoge con la latitud).
    const side = Math.min(d * 111_320, d * 111_320 * Math.cos((lat * Math.PI) / 180))
    const seen = new Set<string>()
    for (let r = 0; r <= MAX_INDEX_RINGS; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
          for (const eid of index.cells.get(cellKey(i, j)) ?? []) {
            if (seen.has(eid)) continue
            seen.add(eid)
            const e = graph.edges.get(eid)
            if (e) consider(e)
          }
        }
      }
      // Todo lo que queda fuera de los anillos 0..r está al menos a r·lado.
      if (best && (best as EdgeSnap).distance <= r * side) return best
    }
  }
  // Sin índice (grafos de prueba, mapas propios) o nada cerca: búsqueda completa.
  best = null
  for (const edge of graph.edges.values()) consider(edge)
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
    const dh = polylineLength(head)
    const dt = polylineLength(tail)
    // El tiempo realista del tramo se reparte en proporción a la distancia.
    const share = (part: number) => (d.time === undefined ? undefined : d.time * (part / Math.max(d.distance, 1e-9)))
    add({ ...d, id: `${d.id}~a~${id}`, to: id, geometry: head, distance: dh, time: share(dh) })
    add({ ...d, id: `${d.id}~b~${id}`, from: id, geometry: tail, distance: dt, time: share(dt) })
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
