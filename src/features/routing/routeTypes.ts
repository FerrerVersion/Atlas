import type { LatLngTuple } from '@/utils/distance'

/** Clasificación de vías basada en la etiqueta `highway` de OpenStreetMap. */
export type RoadType =
  | 'motorway'
  | 'motorway_link'
  | 'trunk'
  | 'trunk_link'
  | 'primary'
  | 'primary_link'
  | 'secondary'
  | 'secondary_link'
  | 'tertiary'
  | 'tertiary_link'
  | 'unclassified'
  | 'residential'
  | 'living_street'
  | 'service'
  | 'track'
  | 'pedestrian'
  | 'footway'
  | 'path'
  | 'cycleway'
  | 'steps'
  | 'custom'

export type RoadClass = 'highway' | 'major' | 'minor' | 'local' | 'path'

export interface GraphNode {
  id: string
  /** Nombre derivado de las vías reales que confluyen (nunca inventado). */
  name?: string
  lat: number
  lng: number
  type: 'intersection' | 'endpoint' | 'waypoint'
}

/** Arista dirigida del grafo. Una vía de doble sentido genera dos aristas. */
export interface GraphEdge {
  id: string
  from: string
  to: string
  name?: string
  ref?: string
  /** Metros, coherentes con la geometría. */
  distance: number
  /** km/h */
  speedLimit: number
  /** Segundos de recorrido realistas (frenando en curvas). Si falta: distancia / límite. */
  time?: number
  roadType: RoadType
  /** La vía original es de sentido único. */
  oneWay: boolean
  geometry: LatLngTuple[]
  roundabout?: boolean
  bridge?: boolean
  tunnel?: boolean
  /** Identificador de la vía de origen (p. ej. id OSM). */
  sourceId?: string
}

export interface RoadGraph {
  nodes: Map<string, GraphNode>
  edges: Map<string, GraphEdge>
  /** nodeId → ids de aristas salientes. */
  outgoing: Map<string, string[]>
  /** Velocidad máxima del grafo (km/h), usada por la heurística admisible. */
  maxSpeed: number
  /** Aumenta con cada cambio estructural (las cachés derivadas lo comprueban). */
  revision?: number
  /** Índice espacial de aristas (cuadrícula), mantenido por GraphBuilder. */
  index?: EdgeIndex
}

/**
 * Cuadrícula de celdas de `cellDeg` grados → ids de las aristas que la tocan (clave
 * numérica, ver cellKey). De cada vía de doble sentido solo se indexa la arista de ida:
 * la de vuelta tiene la misma geometría y el ajuste a la vía ya trata las dos.
 */
export interface EdgeIndex {
  cellDeg: number
  cells: Map<number, Set<string>>
}

/** Clave numérica de una celda (i = fila, j = columna; admite coordenadas negativas). */
export const cellKey = (i: number, j: number) => (i + 40_000) * 100_000 + (j + 40_000)

export type CostMode = 'fastest' | 'shortest'
export type TravelProfile = 'car' | 'walk'

export interface RouteOptions {
  cost?: CostMode
  avoidHighways?: boolean
  /** Límite de nodos expandidos para proteger el hilo principal. */
  maxExpansions?: number
  /** Rumbo (°) con el que se circula en el origen: salir en sentido contrario se penaliza. */
  startBearing?: number
  /** Coste de dar la vuelta en mitad de la calle al salir (s en `fastest`, m en `shortest`). */
  startReversePenalty?: number
  /** Coste de volver por donde se ha venido en un cruce (s en `fastest`, m en `shortest`). */
  uTurnPenalty?: number
}

export interface RouteSuccess {
  ok: true
  nodes: string[]
  edges: GraphEdge[]
  distance: number
  /** segundos */
  duration: number
  geometry: LatLngTuple[]
  expanded: number
}

export type RouteFailureReason = 'empty-graph' | 'node-not-found' | 'unreachable' | 'limit-exceeded'

export interface RouteFailure {
  ok: false
  reason: RouteFailureReason
  message: string
  expanded: number
}

export type RouteResult = RouteSuccess | RouteFailure

export type ManeuverType =
  | 'depart'
  | 'continue'
  | 'slight-left'
  | 'slight-right'
  | 'left'
  | 'right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'roundabout'
  | 'merge-highway'
  | 'exit-highway'
  | 'waypoint'
  | 'arrive'

export interface Instruction {
  type: ManeuverType
  text: string
  /** Calle por la que se circula tras la maniobra (real, o vacía si OSM no la nombra). */
  street?: string
  /** Metros recorridos tras la maniobra hasta la siguiente. */
  distance: number
  duration: number
  /** Distancia acumulada desde el inicio de la ruta hasta el punto de maniobra. */
  offset: number
  /** Tiempo acumulado hasta el punto de maniobra. */
  timeOffset: number
  location: LatLngTuple
  roundaboutExit?: number
  angle?: number
}

export interface RouteLeg {
  from: string
  to: string
  result: RouteSuccess
}

export interface MultiRoute {
  legs: RouteLeg[]
  nodes: string[]
  geometry: LatLngTuple[]
  distance: number
  duration: number
  instructions: Instruction[]
  /** Puntos donde se ajustó cada parada a la red. */
  snapped: { lat: number; lng: number; offsetMeters: number; nodeId: string }[]
  /** Alguna descarga falló: la ruta se calculó con datos parciales y puede no ser la mejor. */
  incomplete?: boolean
}
