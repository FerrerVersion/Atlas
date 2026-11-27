import { haversine, polylineLength, type LatLngTuple } from '@/utils/distance'
import { cellKey, type GraphEdge, type GraphNode, type RoadClass, type RoadGraph, type RoadType, type TravelProfile } from './routeTypes'
import { curveAwareTime } from './travelTime'
import { travelSeconds } from '@/utils/distance'

/** Segundos para recorrer una arista (con curvas si se calcularon al construir el grafo). */
export const edgeTime = (e: GraphEdge) => e.time ?? travelSeconds(e.distance, e.speedLimit)

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
  // Caminos (muy habituales como acceso a casas de campo y urbanizaciones). Se usan con
  // velocidad baja, así que solo sirven para llegar o salir, salvo que estén restringidos.
  'track',
  'custom',
])

/** Valores de acceso que impiden circular a un coche particular. */
const NO_CAR_ACCESS = new Set(['no', 'private', 'agricultural', 'forestry', 'delivery', 'customers', 'emergency', 'military', 'discouraged'])
/** Valores de acceso que impiden pasar a pie. */
const NO_FOOT_ACCESS = new Set(['no', 'private', 'use_sidepath', 'emergency', 'military'])

/**
 * Jerarquía de acceso de OSM: manda la etiqueta MÁS ESPECÍFICA que exista. Para un
 * coche, motorcar > motor_vehicle > vehicle > access; a pie, foot > access.
 * Ejemplos: access=no + foot=yes (zona peatonal) se puede recorrer a pie;
 * access=no + motor_vehicle=yes se puede recorrer en coche; access=no + bus=yes, no.
 * Devuelve el valor que aplica o undefined si ninguna etiqueta lo dice.
 */
export function accessFor(tags: Record<string, string>, profile: TravelProfile): string | undefined {
  const chain = profile === 'car' ? ['motorcar', 'motor_vehicle', 'vehicle', 'access'] : ['foot', 'access']
  for (const key of chain) {
    const v = tags[key]?.trim().toLowerCase()
    // Valores con condiciones (p. ej. "no @ (Mo-Fr 08:00-10:00)") o varios (";")
    // se toman por su primera parte: es la regla general.
    if (v) return v.split(/[;@]/)[0].trim()
  }
  return undefined
}

/** Velocidad en caminos según su firmeza (tracktype de OSM). */
export function trackSpeed(tags: Record<string, string>): number {
  switch (tags.tracktype) {
    case 'grade1':
      return 30
    case 'grade2':
      return 20
    case 'grade3':
      return 15
    default:
      return 12
  }
}

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
  const access = accessFor(tags, profile)
  if (profile === 'car') {
    if (!CAR_TYPES.has(type)) return false
    if (access && NO_CAR_ACCESS.has(access)) return false
    // Caminos en muy mal estado o marcados como intransitables.
    if (type === 'track' && (tags.tracktype === 'grade5' || tags.smoothness === 'impassable')) return false
    return true
  }
  if (access && NO_FOOT_ACCESS.has(access)) return false
  // Autovías y vías rápidas: a pie solo si una etiqueta lo permite expresamente.
  if (WALK_EXCLUDED.has(type)) return tags.foot === 'yes' || tags.foot === 'designated' || tags.foot === 'permissive'
  return true
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
  return new GraphBuilder(options).addWays(ways).graph
}

/** Lado de las celdas del índice espacial de aristas (~0,005° ≈ 430-550 m). */
export const EDGE_INDEX_CELL_DEG = 0.005

/**
 * Construye el grafo de forma INCREMENTAL: al añadir vías solo se procesan las
 * nuevas y las ya cargadas que pasan por un nodo que ahora es un cruce (hay que
 * partirlas ahí). El resultado es idéntico a construirlo de cero con todas las vías.
 * Mantiene además un índice espacial de las aristas para el ajuste a la vía.
 */
export class GraphBuilder {
  readonly graph: RoadGraph = createGraph()
  private readonly profile: TravelProfile
  private readonly maxEdgeLength: number
  private usage = new Map<number, number>()
  private nodeNames = new Map<number, Set<string>>()
  /**
   * Nodo OSM → vías utilizables que pasan por él: un número si es una sola (casi
   * todos los nodos, los interiores) y una lista solo en los cruces (menos memoria).
   */
  private nodeWays = new Map<number, number | number[]>()
  private ways = new Map<number, { way: OsmWay; type: RoadType }>()
  /** Todas las vías ya evaluadas (también las descartadas para este perfil). */
  private seen = new Set<number>()
  /** Vía → aristas que generó (para rehacerla si cambia). */
  private wayEdges = new Map<number, string[]>()
  /** Nodo del grafo → nº de extremos de arista que lo usan (se borra al llegar a 0). */
  private refs = new Map<string, number>()

  constructor(options: BuildGraphOptions = {}) {
    this.profile = options.profile ?? 'car'
    this.maxEdgeLength = options.maxEdgeLength ?? 250
    this.graph.revision = 0
    this.graph.index = { cellDeg: EDGE_INDEX_CELL_DEG, cells: new Map() }
  }

  has(wayId: number) {
    return this.ways.has(wayId)
  }

  /** ¿Ya se evaluó esta vía (aunque no sirva para este perfil)? */
  knows(wayId: number) {
    return this.seen.has(wayId)
  }

  addWays(ways: Iterable<OsmWay>): this {
    const fresh: number[] = []
    // Grafo vacío (construcción completa): todo es nuevo y los nodos se crean ya con su
    // tipo y nombre definitivos, así que no hace falta saber qué nodos cambiaron.
    const initial = this.graph.edges.size === 0
    const touched = new Set<number>()
    for (const way of ways) {
      if (this.seen.has(way.id)) continue
      this.seen.add(way.id)
      const type = toRoadType(way.tags.highway)
      if (!type || !isAllowed(type, way.tags, this.profile)) continue
      if (way.nodes.length < 2 || way.nodes.length !== way.geometry.length) continue
      this.ways.set(way.id, { way, type })
      fresh.push(way.id)
      const label = way.tags.name ?? way.tags.ref
      way.nodes.forEach((id, i) => {
        // Una vía cerrada (rotonda) usa su primer nodo dos veces: cuenta solo una.
        if (i === way.nodes.length - 1 && id === way.nodes[0]) return
        this.usage.set(id, (this.usage.get(id) ?? 0) + 1)
        if (!initial) touched.add(id)
        const prev = this.nodeWays.get(id)
        if (prev === undefined) this.nodeWays.set(id, way.id)
        else if (typeof prev === 'number') this.nodeWays.set(id, [prev, way.id])
        else prev.push(way.id)
        if (label) {
          let set = this.nodeNames.get(id)
          if (!set) this.nodeNames.set(id, (set = new Set()))
          set.add(label)
        }
      })
    }
    if (fresh.length === 0) return this

    if (initial) {
      for (const w of fresh) this.addWayEdges(w)
      this.graph.revision = (this.graph.revision ?? 0) + 1
      return this
    }
    // Vías a (re)partir: las nuevas y las existentes que pasan por un nodo que ahora es cruce.
    const resplit = new Set(fresh)
    for (const n of touched) {
      const list = this.nodeWays.get(n)
      if (Array.isArray(list)) for (const w of list) resplit.add(w)
    }
    for (const w of resplit) this.removeWayEdges(w)
    for (const w of resplit) this.addWayEdges(w)
    // Tipo y nombre de los nodos afectados (un extremo puede haberse convertido en cruce).
    for (const n of touched) {
      const node = this.graph.nodes.get(`n${n}`)
      if (!node) continue
      node.type = (this.usage.get(n) ?? 0) > 1 ? 'intersection' : 'endpoint'
      node.name = this.nameOf(n)
    }
    this.graph.revision = (this.graph.revision ?? 0) + 1
    return this
  }

  private nameOf(osmId: number) {
    const names = this.nodeNames.get(osmId)
    // Orden alfabético: el nombre no depende del orden en que llegaron las vías.
    return names && names.size > 1 ? [...names].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 3).join(' / ') : undefined
  }

  private ensureNode(osmId: number, lat: number, lng: number) {
    const id = `n${osmId}`
    if (!this.graph.nodes.has(id)) {
      addNode(this.graph, {
        id,
        lat,
        lng,
        type: (this.usage.get(osmId) ?? 0) > 1 ? 'intersection' : 'endpoint',
        name: this.nameOf(osmId),
      })
    }
    return id
  }

  private indexCells(e: GraphEdge): number[] {
    const d = EDGE_INDEX_CELL_DEG
    let s = Infinity, n = -Infinity, w = Infinity, ea = -Infinity
    for (const [lat, lng] of e.geometry) {
      if (lat < s) s = lat
      if (lat > n) n = lat
      if (lng < w) w = lng
      if (lng > ea) ea = lng
    }
    const keys: number[] = []
    for (let i = Math.floor(s / d); i <= Math.floor(n / d); i++) {
      for (let j = Math.floor(w / d); j <= Math.floor(ea / d); j++) keys.push(cellKey(i, j))
    }
    return keys
  }

  private removeWayEdges(wayId: number) {
    const ids = this.wayEdges.get(wayId)
    if (!ids) return
    const g = this.graph
    for (const eid of ids) {
      const e = g.edges.get(eid)
      if (!e) continue
      const out = g.outgoing.get(e.from)
      if (out) {
        const k = out.indexOf(eid)
        if (k >= 0) out.splice(k, 1)
      }
      if (!eid.endsWith(':r')) for (const key of this.indexCells(e)) g.index!.cells.get(key)?.delete(eid)
      g.edges.delete(eid)
      for (const nid of [e.from, e.to]) {
        const r = (this.refs.get(nid) ?? 1) - 1
        if (r > 0) this.refs.set(nid, r)
        else {
          this.refs.delete(nid)
          g.nodes.delete(nid)
          g.outgoing.delete(nid)
        }
      }
    }
    this.wayEdges.delete(wayId)
  }

  private addWayEdges(wayId: number) {
    const entry = this.ways.get(wayId)
    if (!entry) return
    const { way, type } = entry
    const g = this.graph
    const profile = this.profile
    const dir = onewayDirection(way.tags, profile)
    const speed =
      profile === 'walk'
        ? WALK_SPEED_KMH
        : type === 'track'
          ? Math.min(parseMaxSpeed(way.tags.maxspeed) ?? trackSpeed(way.tags), 40)
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
    const created: string[] = []
    let segStart = 0
    let segLen = 0
    let segIndex = 0
    for (let i = 1; i < way.nodes.length; i++) {
      const a = way.geometry[i - 1]
      const b = way.geometry[i]
      segLen += haversine(a.lat, a.lon, b.lat, b.lon)
      const isLast = i === way.nodes.length - 1
      const isJunction = (this.usage.get(way.nodes[i]) ?? 0) > 1
      if (!isLast && !isJunction && segLen < this.maxEdgeLength) continue

      const startOsm = way.nodes[segStart]
      const endOsm = way.nodes[i]
      if (startOsm !== endOsm) {
        const g0 = way.geometry[segStart]
        const g1 = way.geometry[i]
        const from = this.ensureNode(startOsm, g0.lat, g0.lon)
        const to = this.ensureNode(endOsm, g1.lat, g1.lon)
        const geometry = way.geometry.slice(segStart, i + 1).map((p) => [p.lat, p.lon] as LatLngTuple)
        const id = `w${way.id}_${segIndex++}`
        const forward = dir === -1 ? [...geometry].reverse() : geometry
        // En coche se frena en las curvas (la geometría al revés tarda lo mismo).
        const time = profile === 'car' ? curveAwareTime(forward, speed) : undefined
        const road = { ...base, id, time, geometry: forward, from: dir === -1 ? to : from, to: dir === -1 ? from : to }
        const before = g.edges.size
        addRoad(g, road)
        const ids = g.edges.size - before === 2 ? [`${id}:f`, `${id}:r`] : [`${id}:f`]
        for (const eid of ids) {
          const e = g.edges.get(eid)!
          created.push(eid)
          this.refs.set(e.from, (this.refs.get(e.from) ?? 0) + 1)
          this.refs.set(e.to, (this.refs.get(e.to) ?? 0) + 1)
          if (eid.endsWith(':r')) continue
          for (const key of this.indexCells(e)) {
            let set = g.index!.cells.get(key)
            if (!set) g.index!.cells.set(key, (set = new Set()))
            set.add(eid)
          }
        }
      }
      segStart = i
      segLen = 0
    }
    this.wayEdges.set(wayId, created)
  }
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

const componentCache = new WeakMap<RoadGraph, { revision: number | undefined; cc: ReturnType<typeof connectedComponents> }>()

/** Componentes conexas del grafo, recalculadas solo si el grafo ha cambiado. */
export function componentsOf(graph: RoadGraph) {
  const cached = componentCache.get(graph)
  if (cached && cached.revision === graph.revision) return cached.cc
  const cc = connectedComponents(graph)
  componentCache.set(graph, { revision: graph.revision, cc })
  return cc
}

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
  const cc = componentsOf(graph)
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
