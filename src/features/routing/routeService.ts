import { networkStore } from '@/features/osm/networkStore'
import { fetchRoadNetwork, type NetworkQueryPlan } from '@/features/osm/overpassService'
import { bboxAround, bboxDiagonal, bboxOf, expandBBox } from '@/utils/geometry'
import { concatPolylines } from '@/utils/geometry'
import { findRoute } from './astar'
import { nearestNode } from './graph'
import { generateInstructions } from './routeInstructions'
import type { CostMode, Instruction, MultiRoute, RoadGraph, RouteLeg, TravelProfile } from './routeTypes'

export interface RoutePoint {
  lat: number
  lng: number
  label?: string
}

export interface RoutePreferences {
  profile: TravelProfile
  cost: CostMode
  avoidHighways: boolean
}

export class RouteError extends Error {}

/** Distancia máxima (m) entre una parada y la red para considerarla accesible. */
export const MAX_SNAP_DISTANCE = 1500

/**
 * Decide qué datos descargar para un conjunto de paradas:
 *  - trayectos cortos: todas las calles del área;
 *  - trayectos largos: todas las calles alrededor de cada parada + solo vías
 *    principales en el corredor (jerarquía estilo «carreteras primero»).
 */
export function planNetworkQuery(points: RoutePoint[], profile: TravelProfile): NetworkQueryPlan {
  const box = bboxOf(points)
  const diag = bboxDiagonal(box)
  if (profile === 'walk') {
    if (diag > 25_000) throw new RouteError('A pie solo se calculan rutas de hasta ~25 km con datos en vivo.')
    return { detail: [expandBBox(box, 600)] }
  }
  if (diag <= 6_000) return { detail: [expandBBox(box, 900)] }
  if (diag > 320_000) {
    throw new RouteError(
      'La distancia entre paradas es demasiado grande para descargar la red en vivo (máx. ~300 km). Importa datos OSM locales para trayectos más largos.',
    )
  }
  const radius = diag > 60_000 ? 2500 : 1500
  const level = diag <= 30_000 ? 'tertiary' : diag <= 90_000 ? 'secondary' : diag <= 200_000 ? 'primary' : 'trunk'
  return {
    detail: points.map((p) => bboxAround(p.lat, p.lng, radius)),
    corridor: { bbox: expandBBox(box, Math.max(3000, diag * 0.12)), level },
  }
}

export interface ComputeOptions {
  signal?: AbortSignal
  /** Si es false, solo usa los datos ya cargados (modo offline/demo). */
  download?: boolean
  onStatus?: (status: string) => void
}

/** Calcula una ruta que pasa por todas las paradas en orden. */
export async function computeMultiRoute(
  points: RoutePoint[],
  prefs: RoutePreferences,
  opts: ComputeOptions = {},
): Promise<MultiRoute> {
  if (points.length < 2) throw new RouteError('Se necesitan al menos un origen y un destino.')

  // Evita peticiones innecesarias: si la zona ya está cargada se usa directamente.
  const alreadyLoaded = networkStore.covers(expandBBox(bboxOf(points), 300))
  if (opts.download !== false && !alreadyLoaded) {
    opts.onStatus?.('Descargando red viaria de OpenStreetMap…')
    const plan = planNetworkQuery(points, prefs.profile)
    const ways = await fetchRoadNetwork(plan, opts.signal)
    networkStore.addWays(ways)
    networkStore.addCoverage(plan.detail)
  }
  opts.signal?.throwIfAborted()

  opts.onStatus?.('Construyendo grafo…')
  const graph = networkStore.graph(prefs.profile)
  if (graph.nodes.size === 0) {
    throw new RouteError('No hay datos de carreteras para esta zona. No se puede calcular la ruta.')
  }
  opts.onStatus?.('Calculando ruta óptima con A*…')
  return routeOnGraph(graph, points, prefs)
}

/** Núcleo síncrono: ajuste a la red + A* por tramos + instrucciones. */
export function routeOnGraph(graph: RoadGraph, points: RoutePoint[], prefs: Omit<RoutePreferences, 'profile'>): MultiRoute {
  const snapped = points.map((p, i) => {
    const s = nearestNode(graph, p.lat, p.lng)
    if (!s || s.distance > MAX_SNAP_DISTANCE) {
      const which = i === 0 ? 'El origen' : i === points.length - 1 ? 'El destino' : `La parada ${i}`
      throw new RouteError(`${which} está a más de ${MAX_SNAP_DISTANCE / 1000} km de cualquier vía cargada.`)
    }
    return { lat: s.node.lat, lng: s.node.lng, offsetMeters: s.distance, nodeId: s.node.id }
  })

  const legs: RouteLeg[] = []
  const instructions: Instruction[] = []
  let offset = 0
  let time = 0
  for (let k = 0; k < snapped.length - 1; k++) {
    const res = findRoute(graph, snapped[k].nodeId, snapped[k + 1].nodeId, {
      cost: prefs.cost,
      avoidHighways: prefs.avoidHighways,
    })
    if (!res.ok) {
      const leg = snapped.length > 2 ? ` (tramo ${k + 1})` : ''
      throw new RouteError(`No se ha podido calcular la ruta${leg}: ${res.message}`)
    }
    legs.push({ from: snapped[k].nodeId, to: snapped[k + 1].nodeId, result: res })
    const isLast = k === snapped.length - 2
    if (res.edges.length > 0) {
      instructions.push(
        ...generateInstructions(graph, res.edges, {
          startOffset: offset,
          startTime: time,
          arrivalType: isLast ? 'arrive' : 'waypoint',
          waypointIndex: k + 1,
          resumeFromWaypoint: k > 0,
        }),
      )
    } else if (!isLast) {
      instructions.push({
        type: 'waypoint',
        text: `Has llegado a la parada ${k + 1}`,
        distance: 0,
        duration: 0,
        offset,
        timeOffset: time,
        location: [snapped[k + 1].lat, snapped[k + 1].lng],
      })
    }
    offset += res.distance
    time += res.duration
  }
  if (instructions.length === 0 || instructions[instructions.length - 1].type !== 'arrive') {
    const end = snapped[snapped.length - 1]
    instructions.push({
      type: 'arrive',
      text: 'Has llegado a tu destino',
      distance: 0,
      duration: 0,
      offset,
      timeOffset: time,
      location: [end.lat, end.lng],
    })
  }

  // Une los tramos sin duplicar el nodo de unión.
  const nodes: string[] = []
  for (const leg of legs) {
    for (const n of leg.result.nodes) if (nodes[nodes.length - 1] !== n) nodes.push(n)
  }

  return {
    legs,
    nodes,
    geometry: concatPolylines(legs.map((l) => l.result.geometry)),
    distance: offset,
    duration: time,
    instructions,
    snapped,
  }
}
