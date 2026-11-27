import { ensureRoadCells } from '@/features/osm/cellLoader'
import { networkStore } from '@/features/osm/networkStore'
import { fetchRoadNetwork, MAJOR_ROADS, OverpassError, type NetworkQueryPlan } from '@/features/osm/overpassService'
import { bboxAround, bboxDiagonal, bboxOf, expandBBox, type BBox } from '@/utils/geometry'
import { concatPolylines, endBearing } from '@/utils/geometry'
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
  /** Rumbo (°) de un origen GPS en marcha: la ruta parte en ese sentido si es razonable. */
  heading?: number
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
 * En coche, dar la vuelta en mitad de la calle al salir (o al recalcular en marcha)
 * cuesta este tiempo equivalente. Es penalización, no prohibición: si no hay
 * alternativa razonable, la ruta da la vuelta.
 */
export const REVERSE_START_PENALTY_S = 60
/** …y volver por donde se ha venido en un cruce. */
export const U_TURN_PENALTY_S = 40
/** Equivalencia para el modo «más corta» (m por s, ≈ 27 km/h urbanos). */
const PENALTY_M_PER_S = 7.5

type GraphPrefs = Omit<RoutePreferences, 'profile'> & { profile?: TravelProfile }

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
    // Todas las calles y caminos, pero solo a lo largo de cada tramo (no el rectángulo
    // entero: en 25 km de ciudad serían cientos de km² de aceras).
    return { detail: walkCorridor(points) }
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
  const accessRadius = diag > 60_000 ? 8000 : ACCESS_RADIUS
  // Primero el nivel más ligero razonable; si no conecta, se amplía (ver computeMultiRoute).
  const level: CorridorLevel = diag <= 30_000 ? 'secondary' : diag <= 120_000 ? 'primary' : 'trunk'
  return {
    carOnly: true,
    detail: points.map((p) => bboxAround(p.lat, p.lng, radius)),
    access: points.map((p) => bboxAround(p.lat, p.lng, accessRadius)),
    corridor: { bbox: expandBBox(box, Math.max(3000, diag * 0.12)), level },
  }
}

/** Radio del anillo de acceso en trayectos medios (y en la precarga). */
export const ACCESS_RADIUS = 5000

/** Separación entre muestras del corredor a pie y margen a cada lado (mínimo / máximo). */
export const WALK_STEP_M = 1_000
export const WALK_MARGIN_MIN_M = 600
export const WALK_MARGIN_MAX_M = 1_500

/**
 * Zonas a lo largo de cada tramo a pie (línea recta entre paradas) con un margen
 * proporcional a su longitud: ahí están los caminos que puede usar la ruta. Si no
 * bastan, computeMultiRoute amplía el margen una vez.
 */
export function walkCorridor(points: RoutePoint[], scale = 1): BBox[] {
  const boxes: BBox[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const len = haversine(a.lat, a.lng, b.lat, b.lng)
    const margin = Math.min(WALK_MARGIN_MAX_M, Math.max(WALK_MARGIN_MIN_M, len * 0.1)) * scale
    const steps = Math.max(1, Math.ceil(len / WALK_STEP_M))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      boxes.push(bboxAround(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t, margin))
    }
  }
  return boxes
}



/**
 * Precarga las calles alrededor de una parada en cuanto se elige, antes de que exista
 * la ruta. Solo las celdas cercanas (las mismas que usa el mapa y el cálculo): el
 * anillo de acceso de 5 km se descarga únicamente si la ruta resulta ser larga, así
 * una ruta corta nunca provoca descargas grandes.
 */
export async function prefetchAround(point: RoutePoint, profile: TravelProfile, signal?: AbortSignal) {
  if (profile !== 'car') return
  await ensureRoadCells(bboxAround(point.lat, point.lng, 600), { maxCells: 9, signal })
}

export interface ComputeOptions {
  signal?: AbortSignal
  /** Si es false, solo usa los datos ya cargados (modo offline/demo). */
  download?: boolean
  onStatus?: (status: string) => void
  /**
   * Ruta provisional: en cuanto los datos que ya han llegado permiten una ruta válida
   * (por calles reales) se entrega aquí, sin esperar al resto de la descarga.
   */
  onProvisional?: (route: MultiRoute) => void
  /** Alguna descarga falló y la ruta se ha calculado con los datos que sí llegaron. */
  onIncomplete?: () => void
}

/** Calcula una ruta que pasa por todas las paradas en orden. */
export async function computeMultiRoute(
  points: RoutePoint[],
  prefs: RoutePreferences,
  opts: ComputeOptions = {},
): Promise<MultiRoute> {
  if (points.length < 2) throw new RouteError('Se necesitan al menos un origen y un destino.')
  // Mientras se calcula, la zona del trayecto no se libera de memoria aunque llegue mucha red.
  const box = bboxOf(points)
  const unpin = networkStore.pin([expandBBox(box, Math.max(5_000, bboxDiagonal(box) * 0.15))])
  try {
    return await computeWithPinnedArea(points, prefs, opts)
  } finally {
    unpin()
  }
}

async function computeWithPinnedArea(points: RoutePoint[], prefs: RoutePreferences, opts: ComputeOptions): Promise<MultiRoute> {

  // Evita peticiones innecesarias: si la zona ya está cargada se usa directamente.
  const alreadyLoaded = networkStore.covers(expandBBox(bboxOf(points), 300))
  const download = opts.download !== false && !alreadyLoaded
  const plan = download ? planNetworkQuery(points, prefs.profile) : null
  const onRetry = (host: string) => opts.onStatus?.(`El servidor no responde; probando ${host}…`)

  // Ruta provisional: se intenta con lo que ya hay (precarga, mapa) y tras cada trozo.
  let provisional = false
  /** Primer error de descarga (si lo hubo): la ruta se intenta igualmente con lo que llegó. */
  let downloadError: unknown = null
  const tryProvisional = () => {
    if (!opts.onProvisional || provisional || networkStore.size === 0 || opts.signal?.aborted) return
    try {
      const route = routeOnGraph(networkStore.graph(prefs.profile), points, prefs)
      provisional = true
      opts.onProvisional(route)
    } catch {
      /* aún faltan datos para conectar las paradas */
    }
  }
  if (plan) tryProvisional()

  if (plan) {
    // Descarga por trozos pequeños (cada uno con caché propia): más fiable con
    // servidores Overpass saturados que una única consulta grande.
    // Orden pensado para tener cuanto antes una ruta provisional: las calles de cada
    // parada (casi siempre ya precargadas) y el corredor; los anillos de acceso al final.
    // Las calles se piden por celdas: si la precarga o el mapa ya las tienen, no se repiten.
    type Task = () => Promise<unknown>
    // Las calles cercanas suelen estar ya precargadas o en camino: se esperan aparte para
    // no ocupar una de las 2 plazas de descarga mientras tanto.
    // Sin recorte de celdas (maxCells: Infinity): se piden por bloques. A pie, todo el
    // corredor en una sola llamada (así las zonas que se solapan no se piden dos veces).
    const cellsOf = (areas: BBox | BBox[]) => () => ensureRoadCells(areas, { maxCells: Infinity, signal: opts.signal, onRetry })
    const details: Task[] = prefs.profile === 'walk' ? [cellsOf(plan.detail)] : plan.detail.map((b) => cellsOf(b))
    const downloads: Task[] = [
      ...(plan.corridor ? [() => fetchRoadNetwork({ detail: [], corridor: plan.corridor }, opts.signal, onRetry).then((w) => networkStore.addWays(w))] : []),
      ...(plan.access ?? []).map((b) => () => fetchRoadNetwork({ detail: [], access: [b] }, opts.signal, onRetry).then((w) => networkStore.addWays(w))),
    ]
    const total = details.length + downloads.length
    let done = 0
    const finished = () => {
      done++
      opts.onStatus?.(
        provisional
          ? `Ruta lista · afinando con más datos (${done}/${total})…`
          : `Descargando red viaria de OpenStreetMap (${done}/${total})…`,
      )
      tryProvisional()
    }
    opts.onStatus?.(`Descargando red viaria de OpenStreetMap (0/${total})…`)
    // El cliente de Overpass limita a 2 consultas reales a la vez (en orden de llegada:
    // el corredor, lo más pesado, va primero).
    // Se espera a TODAS las descargas aunque alguna falle: abandonar al primer fallo
    // dejaba otras a medias y la ruta salía «inalcanzable» por falta de datos.
    const results = await Promise.allSettled([...downloads, ...details].map((t) => t().then(finished)))
    opts.signal?.throwIfAborted()
    downloadError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason
  }
  opts.signal?.throwIfAborted()

  opts.onStatus?.('Construyendo grafo…')
  const graph = networkStore.graph(prefs.profile)
  if (graph.nodes.size === 0) {
    if (downloadError instanceof OverpassError) throw downloadError
    throw new RouteError('No hay datos de carreteras para esta zona. No se puede calcular la ruta.')
  }
  opts.onStatus?.('Calculando ruta óptima con A*…')
  let corridor = plan?.corridor
  let walkWidened = false
  for (;;) {
    try {
      const route = routeOnGraph(networkStore.graph(prefs.profile), points, prefs)
      if (downloadError) {
        // Calculada con datos parciales: puede no ser la mejor. Se marca y se avisa.
        route.incomplete = true
        opts.onIncomplete?.()
      }
      return route
    } catch (e) {
      // A pie: si los caminos del corredor no conectan, se amplía su margen una vez.
      if (e instanceof RouteError && e.reason === 'unreachable' && plan && prefs.profile === 'walk' && !walkWidened && !downloadError) {
        walkWidened = true
        opts.onStatus?.('Ampliando la zona de caminos para conectar las paradas…')
        await ensureRoadCells(walkCorridor(points, 2.5), { maxCells: Infinity, signal: opts.signal, onRetry })
        opts.signal?.throwIfAborted()
        continue
      }
      // Si las vías principales no conectan las paradas, se amplía el corredor un nivel.
      const finer = corridor && FINER_LEVEL[corridor.level]
      // Si faltan datos porque una descarga falló, el problema es la descarga (no la red).
      if (e instanceof RouteError && e.reason === 'unreachable' && downloadError instanceof OverpassError) throw downloadError
      if (!(e instanceof RouteError) || e.reason !== 'unreachable' || !corridor || !finer) throw e
      corridor = { ...corridor, level: finer }
      opts.onStatus?.('Ampliando la red de carreteras para conectar las paradas…')
      networkStore.addWays(await fetchRoadNetwork({ detail: [], corridor }, opts.signal, onRetry))
      opts.signal?.throwIfAborted()
    }
  }
}

/** Núcleo síncrono: ajuste a la red + A* por tramos + instrucciones. */
export function routeOnGraph(graph: RoadGraph, points: RoutePoint[], prefs: GraphPrefs): MultiRoute {
  // 1) Proyecta cada parada sobre la calle más cercana (antes de tocar el grafo).
  const snaps = points.map((p, i) => {
    const s = nearestEdge(graph, p.lat, p.lng, p.heading)
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
    return routeFromStops(graph, virtual, snaps, prefs, points[0].heading)
  } finally {
    for (const v of [...virtual].reverse()) v.remove()
  }
}

function routeFromStops(
  graph: RoadGraph,
  virtual: VirtualStop[],
  snaps: EdgeSnap[],
  prefs: GraphPrefs,
  originHeading?: number,
): MultiRoute {
  const snapped = virtual.map((v, i) => ({ lat: v.point[0], lng: v.point[1], offsetMeters: snaps[i].distance, nodeId: v.nodeId }))

  const legs: RouteLeg[] = []
  const instructions: Instruction[] = []
  let offset = 0
  let time = 0
  // A pie se da la vuelta sin problema; en coche se penaliza (ver REVERSE_START_PENALTY_S).
  const car = prefs.profile !== 'walk'
  const scale = prefs.cost === 'shortest' ? PENALTY_M_PER_S : 1
  /** Rumbo al empezar cada tramo: el del GPS en el origen; en una parada, el de llegada. */
  let legHeading = originHeading
  for (let k = 0; k < snapped.length - 1; k++) {
    const res = findRoute(graph, snapped[k].nodeId, snapped[k + 1].nodeId, {
      cost: prefs.cost,
      avoidHighways: prefs.avoidHighways,
      ...(car && {
        uTurnPenalty: U_TURN_PENALTY_S * scale,
        startReversePenalty: REVERSE_START_PENALTY_S * scale,
        startBearing: legHeading,
      }),
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
          departHeading: k === 0 ? originHeading : undefined,
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
    const lastEdge = res.edges[res.edges.length - 1]
    legHeading = lastEdge ? endBearing(lastEdge.geometry) : legHeading
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
