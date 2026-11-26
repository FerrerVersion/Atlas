import { haversine } from '@/utils/distance'
import { concatPolylines } from '@/utils/geometry'
import { edgeTime, isHighwayType } from './graph'
import type { GraphEdge, RoadGraph, RouteOptions, RouteResult } from './routeTypes'

/** Cola de prioridad mínima (montículo binario) con entradas (prioridad, valor). */
export class MinHeap<T> {
  private items: { p: number; v: T }[] = []

  get size() {
    return this.items.length
  }

  push(priority: number, value: T) {
    const items = this.items
    items.push({ p: priority, v: value })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].p <= items[i].p) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }

  pop(): T | undefined {
    const items = this.items
    if (items.length === 0) return undefined
    const top = items[0].v
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && items[l].p < items[m].p) m = l
        if (r < items.length && items[r].p < items[m].p) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}

export function edgeCost(edge: GraphEdge, mode: RouteOptions['cost']): number {
  return mode === 'shortest' ? edge.distance : edgeTime(edge)
}

/**
 * A* sobre un grafo dirigido.
 *
 * - Coste: tiempo (`fastest`, por defecto) o distancia (`shortest`).
 * - Heurística: distancia haversine al destino (dividida por la velocidad máxima
 *   del grafo en modo `fastest`). Nunca sobreestima → la ruta es óptima.
 * - Conjunto cerrado + entradas obsoletas descartadas → sin ciclos infinitos.
 */
export function findRoute(
  graph: RoadGraph,
  startNodeId: string,
  endNodeId: string,
  options: RouteOptions = {},
): RouteResult {
  const mode = options.cost ?? 'fastest'
  const maxExpansions = options.maxExpansions ?? 2_000_000

  if (graph.nodes.size === 0) {
    return { ok: false, reason: 'empty-graph', message: 'No hay datos de carreteras cargados.', expanded: 0 }
  }
  const start = graph.nodes.get(startNodeId)
  const goal = graph.nodes.get(endNodeId)
  if (!start || !goal) {
    const missing = !start ? startNodeId : endNodeId
    return { ok: false, reason: 'node-not-found', message: `El nodo «${missing}» no existe en el grafo.`, expanded: 0 }
  }

  if (startNodeId === endNodeId) {
    return {
      ok: true,
      nodes: [startNodeId],
      edges: [],
      distance: 0,
      duration: 0,
      geometry: [[start.lat, start.lng]],
      expanded: 0,
    }
  }

  const speedMs = Math.max(graph.maxSpeed, 1) / 3.6
  const h = (id: string) => {
    const n = graph.nodes.get(id)!
    const d = haversine(n.lat, n.lng, goal.lat, goal.lng)
    return mode === 'shortest' ? d : d / speedMs
  }

  const gScore = new Map<string, number>([[startNodeId, 0]])
  const cameFrom = new Map<string, GraphEdge>()
  const closed = new Set<string>()
  const open = new MinHeap<string>()
  open.push(h(startNodeId), startNodeId)
  let expanded = 0

  while (open.size > 0) {
    const current = open.pop()!
    if (closed.has(current)) continue
    if (current === endNodeId) return reconstruct(cameFrom, startNodeId, endNodeId, expanded)
    closed.add(current)
    if (++expanded > maxExpansions) {
      return { ok: false, reason: 'limit-exceeded', message: 'La búsqueda superó el límite de nodos.', expanded }
    }
    const gCur = gScore.get(current)!
    for (const edgeId of graph.outgoing.get(current) ?? []) {
      const edge = graph.edges.get(edgeId)!
      if (closed.has(edge.to)) continue
      if (options.avoidHighways && isHighwayType(edge.roadType)) continue
      const tentative = gCur + edgeCost(edge, mode)
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentative)
        cameFrom.set(edge.to, edge)
        open.push(tentative + h(edge.to), edge.to)
      }
    }
  }

  return {
    ok: false,
    reason: 'unreachable',
    message: 'El destino no es alcanzable con la red de carreteras disponible (revisa sentidos únicos o datos).',
    expanded,
  }
}

function reconstruct(
  cameFrom: Map<string, GraphEdge>,
  startId: string,
  endId: string,
  expanded: number,
): RouteResult {
  const edges: GraphEdge[] = []
  let cur = endId
  while (cur !== startId) {
    const edge = cameFrom.get(cur)
    if (!edge) throw new Error('Reconstrucción inconsistente')
    edges.push(edge)
    cur = edge.from
  }
  edges.reverse()
  const nodes = [startId, ...edges.map((e) => e.to)]
  let distance = 0
  let duration = 0
  for (const e of edges) {
    distance += e.distance
    duration += edgeTime(e)
  }
  const geometry = concatPolylines(edges.map((e) => e.geometry))
  return { ok: true, nodes, edges, distance, duration, geometry, expanded }
}
