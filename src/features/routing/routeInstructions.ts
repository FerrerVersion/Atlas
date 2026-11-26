import { formatDistance, turnAngle } from '@/utils/distance'
import { endBearing, startBearing } from '@/utils/geometry'
import { edgeTime, isHighwayType, isLinkType } from './graph'
import type { GraphEdge, Instruction, ManeuverType, RoadGraph } from './routeTypes'

/** Etiqueta legible de una vía usando solo datos reales (nombre y/o referencia). */
export function roadLabel(edge: GraphEdge | undefined): string | undefined {
  if (!edge) return undefined
  if (edge.ref && edge.name && isHighwayType(edge.roadType)) return `${edge.ref} (${edge.name})`
  return edge.name ?? edge.ref ?? undefined
}

/** Identidad de vía para agrupar tramos: nombre/ref; si no hay, la vía OSM de origen. */
const identity = (e: GraphEdge) => e.name ?? e.ref ?? e.sourceId ?? e.id

const CARDINALS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
export const cardinal = (deg: number) => CARDINALS[Math.round(deg / 45) % 8]

export function classifyTurn(angle: number): ManeuverType {
  const a = Math.abs(angle)
  const right = angle > 0
  if (a < 25) return 'continue'
  if (a < 50) return right ? 'slight-right' : 'slight-left'
  if (a < 125) return right ? 'right' : 'left'
  if (a < 165) return right ? 'sharp-right' : 'sharp-left'
  return 'uturn'
}

const TURN_TEXT: Partial<Record<ManeuverType, string>> = {
  'slight-left': 'Gira ligeramente a la izquierda',
  'slight-right': 'Gira ligeramente a la derecha',
  left: 'Gira a la izquierda',
  right: 'Gira a la derecha',
  'sharp-left': 'Gira bruscamente a la izquierda',
  'sharp-right': 'Gira bruscamente a la derecha',
  uturn: 'Cambia de sentido',
}

const ordinal = (n: number) => `${n}.ª`

interface RawManeuver {
  type: ManeuverType
  edgeIndex: number
  street?: string
  angle?: number
  roundaboutExit?: number
  /** Texto base sin distancia. */
  base: (distance: number) => string
}

export interface InstructionOptions {
  /** Distancia y tiempo acumulados previos (para concatenar tramos). */
  startOffset?: number
  startTime?: number
  /** Texto de la llegada (p. ej. «Has llegado a la parada 1»). */
  arrivalType?: 'arrive' | 'waypoint'
  waypointIndex?: number
  resumeFromWaypoint?: boolean
}

/** Cuenta las salidas de la rotonda entre la entrada y la salida tomada. */
function countRoundaboutExits(graph: RoadGraph, edges: GraphEdge[], from: number, to: number): number {
  let exits = 0
  for (let j = from; j < to; j++) {
    const node = edges[j].to
    const hasExit = (graph.outgoing.get(node) ?? []).some((id) => !graph.edges.get(id)?.roundabout)
    if (hasExit) exits++
  }
  return Math.max(1, exits)
}

/** Alternativas reales de salida en un nodo (excluye el regreso por la misma vía). */
function optionsAt(graph: RoadGraph, prev: GraphEdge): number {
  return (graph.outgoing.get(prev.to) ?? []).filter((id) => {
    const e = graph.edges.get(id)
    return e && e.to !== prev.from
  }).length
}

/**
 * Genera instrucciones paso a paso a partir de la geometría de la ruta:
 * ángulos de giro reales entre tramos, cambios de nombre, rotondas y
 * entradas/salidas de autopista. No hay texto aleatorio: todo deriva de los datos.
 */
export function generateInstructions(
  graph: RoadGraph,
  edges: GraphEdge[],
  options: InstructionOptions = {},
): Instruction[] {
  const startOffset = options.startOffset ?? 0
  const startTime = options.startTime ?? 0
  if (edges.length === 0) return []

  const raw: RawManeuver[] = []
  const first = edges[0]
  const departDir = cardinal(startBearing(first.geometry))
  const firstLabel = roadLabel(first)
  raw.push({
    type: 'depart',
    edgeIndex: 0,
    street: firstLabel,
    base: (d) =>
      `${options.resumeFromWaypoint ? 'Desde la parada, dirígete' : 'Dirígete'} hacia el ${departDir}` +
      `${firstLabel ? ` por ${firstLabel}` : ''} durante ${formatDistance(d)}`,
  })

  let i = 1
  while (i < edges.length) {
    const prev = edges[i - 1]
    const next = edges[i]

    // Rotondas: una única maniobra «toma la N.ª salida».
    if (next.roundabout && !prev.roundabout) {
      let k = i
      while (k < edges.length && edges[k].roundabout) k++
      const exitNumber = countRoundaboutExits(graph, edges, i, k)
      const exitEdge = edges[k]
      const street = roadLabel(exitEdge)
      raw.push({
        type: 'roundabout',
        edgeIndex: i,
        street,
        roundaboutExit: exitNumber,
        base: () =>
          k >= edges.length
            ? 'Entra en la rotonda'
            : `En la rotonda, toma la ${ordinal(exitNumber)} salida${street ? ` hacia ${street}` : ''}`,
      })
      i = Math.max(k, i + 1)
      continue
    }

    const angle = turnAngle(endBearing(prev.geometry), startBearing(next.geometry))
    const street = roadLabel(next)
    const sameRoad = identity(prev) === identity(next)

    if (!isHighwayType(prev.roadType) && isHighwayType(next.roadType)) {
      raw.push({
        type: 'merge-highway',
        edgeIndex: i,
        street,
        angle,
        base: () => `Incorpórate a la ${next.roadType === 'motorway' ? 'autopista' : 'autovía'}${street ? ` ${street}` : ''}`,
      })
    } else if (isHighwayType(prev.roadType) && isLinkType(next.roadType)) {
      raw.push({
        type: 'exit-highway',
        edgeIndex: i,
        street,
        angle,
        base: () => `Toma la salida${street ? ` hacia ${street}` : ''}`,
      })
    } else if (!isLinkType(prev.roadType) && isLinkType(next.roadType) && next.roadType.startsWith('motorway')) {
      raw.push({
        type: angle > 0 ? 'slight-right' : 'slight-left',
        edgeIndex: i,
        street,
        angle,
        base: () => `Toma el ramal de acceso a la autopista${street ? ` (${street})` : ''}`,
      })
    } else {
      const choices = optionsAt(graph, prev)
      const turn = classifyTurn(angle)
      if (turn === 'continue' || choices <= 1) {
        // Sin decisión real: solo avisamos si cambia el nombre de la vía.
        if (!sameRoad && street && roadLabel(prev) !== street) {
          raw.push({
            type: 'continue',
            edgeIndex: i,
            street,
            angle,
            base: (d) => `Continúa por ${street} durante ${formatDistance(d)}`,
          })
        }
      } else if (!(sameRoad && Math.abs(angle) < 40)) {
        const verb = TURN_TEXT[turn]!
        raw.push({
          type: turn,
          edgeIndex: i,
          street,
          angle,
          base: () => `${verb}${street ? ` por ${street}` : ' en la siguiente intersección'}`,
        })
      }
    }
    i++
  }

  // Distancias acumuladas por arista.
  const cumDist: number[] = [0]
  const cumTime: number[] = [0]
  for (const e of edges) {
    cumDist.push(cumDist[cumDist.length - 1] + e.distance)
    cumTime.push(cumTime[cumTime.length - 1] + edgeTime(e))
  }
  const total = cumDist[edges.length]
  const totalTime = cumTime[edges.length]

  const out: Instruction[] = raw.map((m, idx) => {
    const endEdge = idx + 1 < raw.length ? raw[idx + 1].edgeIndex : edges.length
    const distance = cumDist[endEdge] - cumDist[m.edgeIndex]
    const duration = cumTime[endEdge] - cumTime[m.edgeIndex]
    return {
      type: m.type,
      text: m.base(distance),
      street: m.street,
      distance,
      duration,
      offset: startOffset + cumDist[m.edgeIndex],
      timeOffset: startTime + cumTime[m.edgeIndex],
      location: edges[m.edgeIndex].geometry[0],
      roundaboutExit: m.roundaboutExit,
      angle: m.angle,
    }
  })

  const last = edges[edges.length - 1]
  const isWaypoint = options.arrivalType === 'waypoint'
  out.push({
    type: isWaypoint ? 'waypoint' : 'arrive',
    text: isWaypoint ? `Has llegado a la parada ${options.waypointIndex ?? ''}`.trim() : 'Has llegado a tu destino',
    distance: 0,
    duration: 0,
    offset: startOffset + total,
    timeOffset: startTime + totalTime,
    location: last.geometry[last.geometry.length - 1],
  })
  return out
}
