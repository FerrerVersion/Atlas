import { haversine, polylineLength, type LatLngTuple } from '@/utils/distance'
import type { GraphEdge, GraphNode, RoadClass, RoadGraph, RoadType, TravelProfile } from './routeTypes'

/* ------------------------------------------------------------------ */
/* Tipos de entrada: subconjunto del JSON de Overpass (out body geom)  */
/* ------------------------------------------------------------------ */

export interface OsmWay {
  type: 'way'
  id: number
  nodes: number[]
  geometry: { lat: number; lon: number }[]
  tags: Record<string, string>
}

/* ------------------------------------------------------------------ */
/* Clasificación y velocidades                                          */
/* ------------------------------------------------------------------ */

const ROAD_TYPES = new Set<RoadType>([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street',
  'service', 'track', 'pedestrian', 'footway', 'path', 'cycleway', 'steps',
])

/** Velocidades por defecto (km/h) cuando OSM no indica `maxspeed`. */
export const DEFAULT_SPEEDS: Record<RoadType, number> = {
  motorway: 110,
  motorway_link: 60,
  trunk: 90,
  trunk_link: 50,
  primary: 60,
  primary_link: 40,
  secondary: 50,
  secondary_link: 40,
  tertiary: 45,
  tertiary_link: 35,
  unclassified: 40,
  residential: 30,
  living_street: 15,
  service: 15,
  track: 15,
  pedestrian: 5,
  footway: 5,
  path: 5,
  cycleway: 15,
  steps: 3,
  custom: 50,
}

const CAR_TYPES = new Set<RoadType>([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
  'custom',
])

const WALK_EXCLUDED = new Set<RoadType>(['motorway', 'motorway_link', 'trunk', 'trunk_link'])

export const WALK_SPEED_KMH = 4.8

export function toRoadType(highway: string | undefined): RoadType | null {
  if (!highway) return null
  return ROAD_TYPES.has(highway as RoadType) ? (highway as RoadType) : null
}

export function roadClass(type: RoadType): RoadClass {
  switch (type) {
    case 'motorway':
    case 'motorway_link':
    case 'trunk':
    case 'trunk_link':
      return 'highway'
    case 'primary':
    case 'primary_link':
    case 'secondary':
    case 'secondary_link':
      return 'major'
    case 'tertiary':
    case 'tertiary_link':
    case 'unclassified':
      return 'minor'
    case 'residential':
    case 'living_street':
    case 'service':
    case 'track':
    case 'custom':
      return 'local'
    default:
      return 'path'
  }
}

export const isHighwayType = (t: RoadType) => t === 'motorway' || t === 'trunk'
export const isLinkType = (t: RoadType) => t.endsWith('_link')

/** Interpreta `maxspeed` de OSM ("50", "30 mph", "ES:urban"...). */
export function parseMaxSpeed(value: string | undefined): number | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  const num = Number.parseFloat(v)
  if (Number.isFinite(num) && num > 0) return v.includes('mph') ? Math.round(num * 1.609) : num
  if (v.endsWith(':urban')) return 50
  if (v.endsWith(':rural')) return 90
  if (v.endsWith(':motorway')) return 120
  if (v.endsWith(':living_street') || v === 'walk') return 10
  return null
}

/** Sentido de circulación: 1 = solo en el sentido de la geometría, -1 = solo inverso, 0 = ambos. */
export function onewayDirection(tags: Record<string, string>, profile: TravelProfile): -1 | 0 | 1 {
  if (profile === 'walk') return 0
  const ow = tags.oneway?.toLowerCase()
  if (ow === '-1' || ow === 'reverse') return -1
  if (ow === 'yes' || ow === 'true' || ow === '1') return 1
  if (ow === 'no' || ow === 'false' || ow === '0') return 0
  if (tags.junction === 'roundabout' || tags.junction === 'circular') return 1
  if (tags.highway === 'motorway' || tags.highway === 'motorway_link') return 1
  return 0
}

function isAllowed(type: RoadType, tags: Record<string, string>, profile: TravelProfile): boolean {
  const access = tags.access?.toLowerCase()
  if (access === 'no' || access === 'private') return false
  if (profile === 'car') {
    if (!CAR_TYPES.has(type)) return false
    if (tags.motor_vehicle === 'no' || tags.motorcar === 'no') return false
    return true
  }
  if (tags.foot === 'no') return false
  return !WALK_EXCLUDED.has(type)
}

/* ------------------------------------------------------------------ */
/* Construcción del grafo                                               */
/* ------------------------------------------------------------------ */

export interface BuildGraphOptions {
  profile?: TravelProfile
  /** Corta aristas largas en nodos OSM intermedios para mejorar el ajuste a la red. */
  maxEdgeLength?: number
}

/** Grafo vacío listo para añadir nodos/aristas manualmente (tests, mapas propios). */
export function createGraph(): RoadGraph {
  return { nodes: new Map(), edges: new Map(), outgoing: new Map(), maxSpeed: 1 }
}

export function addNode(graph: RoadGraph, node: GraphNode) {
  graph.nodes.set(node.id, node)
  if (!graph.outgoing.has(node.id)) graph.outgoing.set(node.id, [])
}

/** Añade una arista dirigida. La distancia se recalcula desde la geometría si no se indica. */
export function addDirectedEdge(graph: RoadGraph, edge: Omit<GraphEdge, 'distance'> & { distance?: number }) {
  const from = graph.nodes.get(edge.from)
  const to = graph.nodes.get(edge.to)
  if (!from || !to) throw new Error(`Arista ${edge.id} referencia nodos inexistentes`)
  const geometry: LatLngTuple[] =
    edge.geometry.length >= 2 ? edge.geometry : [[from.lat, from.lng], [to.lat, to.lng]]
  const full: GraphEdge = { ...edge, geometry, distance: edge.distance ?? polylineLength(geometry) }
  graph.edges.set(full.id, full)
  graph.outgoing.get(full.from)!.push(full.id)
  graph.maxSpeed = Math.max(graph.maxSpeed, full.speedLimit)
  return full
}

/** Añade una vía; si no es de sentido único genera la arista inversa `${id}:r`. */
export function addRoad(
  graph: RoadGraph,
  road: Omit<GraphEdge, 'distance' | 'geometry'> & { geometry?: LatLngTuple[]; distance?: number },
) {
  const geometry = road.geometry ?? []
  addDirectedEdge(graph, { ...road, id: `${road.id}:f`, geometry })
  if (!road.oneWay) {
    addDirectedEdge(graph, {
      ...road,
      id: `${road.id}:r`,
      from: road.to,
      to: road.from,
      geometry: [...(geometry.length >= 2 ? geometry : [])].reverse(),
    })
  }
}

/**
 * Construye un grafo dirigido a partir de vías OSM. Los nodos del grafo son
 * intersecciones (nodos OSM compartidos por varias vías) y extremos; las aristas
 * conservan la geometría completa y el nombre real de la vía.
 */
export function buildGraphFromOsm(ways: Iterable<OsmWay>, options: BuildGraphOptions = {}): RoadGraph {
  const profile = options.profile ?? 'car'
  const maxEdgeLength = options.maxEdgeLength ?? 250
  const graph = createGraph()

  const usable: { way: OsmWay; type: RoadType }[] = []
  const usage = new Map<number, number>()
  const nodeNames = new Map<number, Set<string>>()

  for (const way of ways) {
    const type = toRoadType(way.tags.highway)
    if (!type || !isAllowed(type, way.tags, profile)) continue
    if (way.nodes.length < 2 || way.nodes.length !== way.geometry.length) continue
    usable.push({ way, type })
    way.nodes.forEach((id, i) => {
      // Una vía cerrada (rotonda) usa su primer nodo dos veces: cuenta solo una.
      if (i === way.nodes.length - 1 && id === way.nodes[0]) return
      usage.set(id, (usage.get(id) ?? 0) + 1)
      const label = way.tags.name ?? way.tags.ref
      if (label) {
        let set = nodeNames.get(id)
        if (!set) nodeNames.set(id, (set = new Set()))
        set.add(label)
      }
    })
  }

  const ensureNode = (osmId: number, lat: number, lng: number, type: GraphNode['type']) => {
    const id = `n${osmId}`
    if (!graph.nodes.has(id)) {
      const names = nodeNames.get(osmId)
      addNode(graph, {
        id,
        lat,
        lng,
        type,
        name: names && names.size > 1 ? [...names].slice(0, 3).join(' / ') : undefined,
      })
    }
    return id
  }

  for (const { way, type } of usable) {
    const dir = onewayDirection(way.tags, profile)
    const speed =
      profile === 'walk'
        ? WALK_SPEED_KMH
        : Math.min(parseMaxSpeed(way.tags.maxspeed) ?? DEFAULT_SPEEDS[type], 130)
    const base = {
      name: way.tags.name,
      ref: way.tags.ref,
      roadType: type,
      speedLimit: speed,
      oneWay: dir !== 0,
      roundabout: way.tags.junction === 'roundabout' || way.tags.junction === 'circular',
      bridge: way.tags.bridge !== undefined && way.tags.bridge !== 'no',
      tunnel: way.tags.tunnel !== undefined && way.tags.tunnel !== 'no',
      sourceId: `way/${way.id}`,
    }

    let segStart = 0
    let segLen = 0
    let segIndex = 0
    for (let i = 1; i < way.nodes.length; i++) {
      const a = way.geometry[i - 1]
      const b = way.geometry[i]
      segLen += haversine(a.lat, a.lon, b.lat, b.lon)
      const isLast = i === way.nodes.length - 1
      const isJunction = (usage.get(way.nodes[i]) ?? 0) > 1
      if (!isLast && !isJunction && segLen < maxEdgeLength) continue

      const startOsm = way.nodes[segStart]
      const endOsm = way.nodes[i]
      if (startOsm !== endOsm) {
        const g0 = way.geometry[segStart]
        const g1 = way.geometry[i]
        const startType = (usage.get(startOsm) ?? 0) > 1 ? 'intersection' : 'endpoint'
        const endType = (usage.get(endOsm) ?? 0) > 1 ? 'intersection' : 'endpoint'
        const from = ensureNode(startOsm, g0.lat, g0.lon, startType)
        const to = ensureNode(endOsm, g1.lat, g1.lon, endType)
        const geometry = way.geometry
          .slice(segStart, i + 1)
          .map((p) => [p.lat, p.lon] as LatLngTuple)
        const id = `w${way.id}_${segIndex++}`
        const forward = dir === -1 ? [...geometry].reverse() : geometry
        const road = { ...base, id, geometry: forward, from: dir === -1 ? to : from, to: dir === -1 ? from : to }
        addRoad(graph, road)
      }
      segStart = i
      segLen = 0
    }
  }

  return graph
}

/* ------------------------------------------------------------------ */
/* Consultas sobre el grafo                                             */
/* ------------------------------------------------------------------ */

/** Etiqueta cada nodo con su componente débilmente conexa y devuelve su tamaño. */
export function connectedComponents(graph: RoadGraph) {
  const neighbours = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    let list = neighbours.get(a)
    if (!list) neighbours.set(a, (list = []))
    list.push(b)
  }
  for (const e of graph.edges.values()) {
    link(e.from, e.to)
    link(e.to, e.from)
  }
  const component = new Map<string, number>()
  const sizes: number[] = []
  for (const id of graph.nodes.keys()) {
    if (component.has(id)) continue
    const c = sizes.length
    let size = 0
    const stack = [id]
    component.set(id, c)
    while (stack.length) {
      const cur = stack.pop()!
      size++
      for (const n of neighbours.get(cur) ?? []) {
        if (!component.has(n)) {
          component.set(n, c)
          stack.push(n)
        }
      }
    }
    sizes.push(size)
  }
  return { component, sizes }
}

const componentCache = new WeakMap<RoadGraph, ReturnType<typeof connectedComponents>>()

export interface SnapResult {
  node: GraphNode
  distance: number
}

/**
 * Nodo del grafo más cercano a un punto. Ignora fragmentos aislados (componentes
 * diminutas) para no ajustar a un trozo de vía desconectado.
 */
export function nearestNode(graph: RoadGraph, lat: number, lng: number): SnapResult | null {
  if (graph.nodes.size === 0) return null
  let cc = componentCache.get(graph)
  if (!cc) componentCache.set(graph, (cc = connectedComponents(graph)))
  const largest = Math.max(...cc.sizes)
  const minSize = Math.min(largest, Math.max(2, Math.floor(largest * 0.05)))
  let best: SnapResult | null = null
  for (const node of graph.nodes.values()) {
    if (cc.sizes[cc.component.get(node.id) ?? 0] < minSize) continue
    const d = haversine(lat, lng, node.lat, node.lng)
    if (!best || d < best.distance) best = { node, distance: d }
  }
  return best
}

export function graphStats(graph: RoadGraph) {
  let length = 0
  for (const e of graph.edges.values()) length += e.distance
  return { nodes: graph.nodes.size, edges: graph.edges.size, lengthMeters: length }
}
