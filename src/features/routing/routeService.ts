import { ensureRoadCells } from '@/features/osm/cellLoader'
import { networkStore } from '@/features/osm/networkStore'
import { fetchRoadNetwork, MAJOR_ROADS, type NetworkQueryPlan } from '@/features/osm/overpassService'
import { bboxAround, bboxDiagonal, bboxOf, expandBBox } from '@/utils/geometry'
import { concatPolylines } from '@/utils/geometry'
import { findRoute } from './astar'
import { attachVirtualStop, nearestEdge, type EdgeSnap, type VirtualStop } from './edgeSnap'
import { MANEUVER_SECONDS } from './travelTime'
import { haversine } from '@/utils/distance'
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
  // Las celdas de detalle incluyen todas las calles: radio corto (1-4 celdas por parada).
  const radius = diag > 60_000 ? 900 : 600
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

/** Descargas simultáneas a Overpass (los servidores públicos admiten ~2 por usuario). */
export const OVERPASS_CONCURRENCY = 2

/** Ejecuta `fn` sobre los elementos con un máximo de `limit` tareas a la vez. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}


/**
 * Precarga las calles alrededor de una parada en cuanto se elige, antes de que
 * exista la ruta. Usa exactamente las mismas consultas que el cálculo posterior
 * (radio de trayecto medio), así que este las encuentra en caché o en curso.
 */
export async function prefetchAround(point: RoutePoint, profile: TravelProfile, signal?: AbortSignal) {
  if (profile !== 'car') return
  // Mismas celdas que usará el cálculo de la ruta (y la carga automática del mapa).
  await ensureRoadCells(bboxAround(point.lat, point.lng, 600), { maxCells: 9, signal })
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
    // El corredor (lo más pesado) primero; el resto en paralelo. Las calles cercanas a
    // cada parada se piden por celdas: si la precarga o el mapa ya las tienen, no se repiten.
    type Task = () => Promise<unknown>
    const tasks: Task[] = [
      ...(plan.corridor ? [() => fetchRoadNetwork({ detail: [], corridor: plan.corridor }, opts.signal, onRetry).then((w) => networkStore.addWays(w))] : []),
      ...plan.detail.map((b) => () => ensureRoadCells(b, { maxCells: 36, signal: opts.signal, onRetry })),
      ...(plan.access ?? []).map((b) => () => fetchRoadNetwork({ detail: [], access: [b] }, opts.signal, onRetry).then((w) => networkStore.addWays(w))),
    ]
    let done = 0
    opts.onStatus?.(`Descargando red viaria de OpenStreetMap (0/${tasks.length})…`)
    await mapLimit(tasks, OVERPASS_CONCURRENCY, async (task) => {
      await task()
      opts.onStatus?.(`Descargando red viaria de OpenStreetMap (${++done}/${tasks.length})…`)
    })
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
  // 1) Proyecta cada parada sobre la calle más cercana (antes de tocar el grafo).
  const snaps = points.map((p, i) => {
    const s = nearestEdge(graph, p.lat, p.lng)
    if (!s || s.distance > MAX_SNAP_DISTANCE) {
      const which = i === 0 ? 'El origen' : i === points.length - 1 ? 'El destino' : `La parada ${i}`
      throw new RouteError(`${which} está a más de ${MAX_SNAP_DISTANCE / 1000} km de cualquier vía cargada.`)
    }
    return s
  })
  const first = snaps[0].point
  if (snaps.every((s) => haversine(s.point[0], s.point[1], first[0], first[1]) < 5)) {
    throw new RouteError(
      'El origen y el destino están en el mismo punto de la red de calles. Elige un destino distinto.',
      'same-point',
    )
  }
  // 2) Nodos temporales en esos puntos; se retiran siempre al terminar.
  const virtual = snaps.map((s, i) => attachVirtualStop(graph, s, `parada:${i}`))
  try {
    return routeFromStops(graph, virtual, snaps, prefs)
  } finally {
    for (const v of [...virtual].reverse()) v.remove()
  }
}

function routeFromStops(
  graph: RoadGraph,
  virtual: VirtualStop[],
  snaps: EdgeSnap[],
  prefs: Omit<RoutePreferences, 'profile'>,
): MultiRoute {
  const snapped = virtual.map((v, i) => ({ lat: v.point[0], lng: v.point[1], offsetMeters: snaps[i].distance, nodeId: v.nodeId }))

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

  const extra = applyManeuverTime(instructions)

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
    duration: time + extra,
    instructions,
    snapped,
  }
}

/**
 * Suma el tiempo de cada maniobra (girar, rotondas, incorporaciones) a la duración del
 * tramo que empieza en ella y retrasa las horas de paso de las siguientes.
 * Devuelve los segundos añadidos en total.
 */
export function applyManeuverTime(instructions: Instruction[]): number {
  let extra = 0
  for (const ins of instructions) {
    ins.timeOffset += extra
    const p = MANEUVER_SECONDS[ins.type] ?? 0
    if (p > 0) {
      ins.duration += p
      extra += p
    }
  }
  return extra
}
