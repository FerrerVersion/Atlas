import { haversine, turnAngle } from '@/utils/distance'
import { concatPolylines, endBearing, startBearing } from '@/utils/geometry'
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
 * - Conjunto cerrado + entradas obsoletas descartadas → sin ciclos infinitos. Como nunca
 *   repite un cruce, la ruta no puede dar media vuelta en un cruce intermedio.
 * - `uTurnPenalty`: volver por donde se ha venido en un cruce cuesta ese extra (con la
 *   arista por la que se llegó al cruce: aproximación habitual en A* por nodos).
 * - `startBearing`: salir en sentido contrario a la marcha (dar la vuelta en mitad de la
 *   calle al recalcular) cuesta `startReversePenalty`. Es coste, no prohibición: si no
 *   hay alternativa razonable, la ruta da la vuelta.
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

  const uTurnPenalty = options.uTurnPenalty ?? 0
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
    const atStart = current === startNodeId
    const outs = graph.outgoing.get(current) ?? []
    // Rumbo con el que se llega a este cruce (para detectar un cambio de sentido).
    const arrival = uTurnPenalty > 0 && !atStart && outs.length > 1 ? cameFrom.get(current) : undefined
    const inBearing = arrival ? endBearing(arrival.geometry) : 0
    for (const edgeId of outs) {
      const edge = graph.edges.get(edgeId)!
      if (closed.has(edge.to)) continue
      if (options.avoidHighways && isHighwayType(edge.roadType)) continue
      let tentative = gCur + edgeCost(edge, mode)
      // Salir en sentido contrario al de la marcha = dar la vuelta en mitad de la calle.
      if (atStart && options.startBearing !== undefined && Math.abs(turnAngle(options.startBearing, startBearing(edge.geometry))) > REVERSE_START_DEG) {
        tentative += options.startReversePenalty ?? 0
      }
      // Volver por donde se ha venido (también por encima de una calle partida por una
      // parada): cambio de sentido en el cruce. Sin otra salida es obligado y no cuenta.
      if (arrival && Math.abs(turnAngle(inBearing, startBearing(edge.geometry))) > U_TURN_DEG) tentative += uTurnPenalty
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentative)
        cameFrom.set(edge.to, edge)
        open.push(tentative + h(edge.to), edge.to)
      }
    }
  }

  return unreachable(expanded)
}

/** Diferencia (°) a partir de la cual salir por una arista supone dar la vuelta respecto al rumbo. */
export const REVERSE_START_DEG = 100
/** Giro a partir del cual pasar de una arista a otra es volver por donde se ha venido. */
export const U_TURN_DEG = 165

const unreachable = (expanded: number): RouteResult => ({
  ok: false,
  reason: 'unreachable',
  message: 'El destino no es alcanzable con la red de carreteras disponible (revisa sentidos únicos o datos).',
  expanded,
})


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
