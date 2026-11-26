import { networkStore } from '@/features/osm/networkStore'
import { fetchRoadNetwork, MAJOR_ROADS, type NetworkQueryPlan } from '@/features/osm/overpassService'
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

export class RouteError extends Error {
  readonly reason?: string
  constructor(message: string, reason?: string) {
    super(message)
    this.reason = reason
  }
}

type CorridorLevel = keyof typeof MAJOR_ROADS
/** Nivel inmediatamente más detallado del corredor (null si ya es el máximo). */
export const FINER_LEVEL: Record<CorridorLevel, CorridorLevel | null> = {
  trunk: 'primary',
  primary: 'secondary',
  secondary: 'tertiary',
  tertiary: null,
}

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
  if (diag <= 6_000) return { detail: [expandBBox(box, 900)], carOnly: true }
  if (diag > 320_000) {
    throw new RouteError(
      'La distancia entre paradas es demasiado grande para descargar la red en vivo (máx. ~300 km). Importa datos OSM locales para trayectos más largos.',
    )
  }
  // Calles completas cerca de cada parada + anillo de acceso más amplio: los enlaces
  // núcleo↔autovía suelen ser carreteras secundarias/terciarias fuera del corredor
  // (p. ej. Buñol solo enlaza con la A-3 por la CV-425, a ~2,7 km del centro).
  const radius = diag > 60_000 ? 1500 : 1000
  const accessRadius = diag > 60_000 ? 8000 : 5000
  // Primero el nivel más ligero razonable; si no conecta, se amplía (ver computeMultiRoute).
  const level: CorridorLevel = diag <= 30_000 ? 'secondary' : diag <= 120_000 ? 'primary' : 'trunk'
  return {
    carOnly: true,
    detail: points.map((p) => bboxAround(p.lat, p.lng, radius)),
    access: points.map((p) => bboxAround(p.lat, p.lng, accessRadius)),
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
  const download = opts.download !== false && !alreadyLoaded
  const plan = download ? planNetworkQuery(points, prefs.profile) : null
  const onRetry = (host: string) => opts.onStatus?.(`El servidor no responde; probando ${host}…`)

  if (plan) {
    // Descarga por trozos pequeños (cada uno con caché propia): más fiable con
    // servidores Overpass saturados que una única consulta grande.
    const parts: NetworkQueryPlan[] = [
      ...plan.detail.map((b) => ({ detail: [b], carOnly: plan.carOnly })),
      ...(plan.access ?? []).map((b) => ({ detail: [], access: [b] })),
      ...(plan.corridor ? [{ detail: [], corridor: plan.corridor }] : []),
    ]
    for (const [i, part] of parts.entries()) {
      opts.onStatus?.(`Descargando red viaria de OpenStreetMap (${i + 1}/${parts.length})…`)
      networkStore.addWays(await fetchRoadNetwork(part, opts.signal, onRetry))
      // Solo cuenta como zona cubierta si se descargaron todas las vías (también peatonales).
      if (!part.carOnly) networkStore.addCoverage(part.detail)
    }
  }
  opts.signal?.throwIfAborted()

  opts.onStatus?.('Construyendo grafo…')
  const graph = networkStore.graph(prefs.profile)
  if (graph.nodes.size === 0) {
    throw new RouteError('No hay datos de carreteras para esta zona. No se puede calcular la ruta.')
  }
  opts.onStatus?.('Calculando ruta óptima con A*…')
  let corridor = plan?.corridor
  for (;;) {
    try {
      return routeOnGraph(networkStore.graph(prefs.profile), points, prefs)
    } catch (e) {
      // Si las vías principales no conectan las paradas, se amplía el corredor un nivel.
      const finer = corridor && FINER_LEVEL[corridor.level]
      if (!(e instanceof RouteError) || e.reason !== 'unreachable' || !corridor || !finer) throw e
      corridor = { ...corridor, level: finer }
      opts.onStatus?.('Ampliando la red de carreteras para conectar las paradas…')
      networkStore.addWays(await fetchRoadNetwork({ detail: [], corridor }, opts.signal, onRetry))
      opts.signal?.throwIfAborted()
    }
  }
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

  if (snapped.every((s) => s.nodeId === snapped[0].nodeId)) {
    throw new RouteError(
      'El origen y el destino están en el mismo punto de la red de calles. Elige un destino distinto.',
      'same-point',
    )
  }

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
      throw new RouteError(`No se ha podido calcular la ruta${leg}: ${res.message}`, res.reason)
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
