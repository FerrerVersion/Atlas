import { formatDistance, turnAngle } from '@/utils/distance'
import { endBearing, startBearing } from '@/utils/geometry'
import { REVERSE_START_DEG } from './astar'
import { edgeTime, isHighwayType, isLinkType, roadClass } from './graph'
import type { GraphEdge, Instruction, ManeuverType, RoadGraph } from './routeTypes'

/** Etiqueta legible de una vía usando solo datos reales (nombre y/o referencia). */
export function roadLabel(edge: GraphEdge | undefined): string | undefined {
  if (!edge) return undefined
  if (edge.ref && edge.name && isHighwayType(edge.roadType)) return `${edge.ref} (${edge.name})`
  return edge.name ?? edge.ref ?? undefined
}

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
  /** Rumbo (°) con el que se circula al salir (recálculo en marcha desde el GPS). */
  departHeading?: number
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

/** Vías que no suponen una decisión al pasar junto a ellas por una calle normal (vados, aparcamientos…). */
const isMinor = (e: GraphEdge) => e.roadType === 'service' || roadClass(e.roadType) === 'path' || e.roadType === 'track'

/**
 * Otras salidas reales en el cruce al que lleva `prev`, aparte de `next` y de volver
 * por donde se ha venido. Las entradas a garajes y aparcamientos no cuentan como
 * alternativa si se circula por una calle normal.
 */
function alternativesAt(graph: RoadGraph, prev: GraphEdge, next: GraphEdge): GraphEdge[] {
  const ignoreMinor = !isMinor(prev) && !isMinor(next)
  const out: GraphEdge[] = []
  for (const id of graph.outgoing.get(prev.to) ?? []) {
    const e = graph.edges.get(id)
    if (!e || e.id === next.id || e.to === prev.from) continue
    if (ignoreMinor && isMinor(e)) continue
    out.push(e)
  }
  return out
}

/** ¿Siguen siendo la misma vía? (mismo nombre/ref; o ambas sin nombre y del mismo tipo). */
function sameRoadAs(a: GraphEdge, b: GraphEdge): boolean {
  const la = roadLabel(a)
  const lb = roadLabel(b)
  if (la || lb) return la === lb
  return a.roadType === b.roadType
}

/** Diferencia mínima con la siguiente opción más recta para que seguir sea «lo obvio». */
const OBVIOUS_MARGIN_DEG = 25
/** Por debajo de esto, seguir por la opción más recta no requiere aviso de giro. */
const OBVIOUS_MAX_DEG = 60
/** Dos maniobras más cerca que esto son una sola (cruces de calzadas separadas, cruces desplazados). */
const MERGE_WITHIN_M = 22
/** Un cambio de nombre seguido enseguida de otra maniobra no se anuncia (la siguiente ya lo dice). */
const MIN_CONTINUE_SEGMENT_M = 60
/** Recorrido mínimo por un anillo para tratarlo como rotonda. */
const MIN_ROUNDABOUT_M = 15

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
  const heading = options.departHeading
  if (heading !== undefined && Math.abs(turnAngle(heading, startBearing(first.geometry))) > REVERSE_START_DEG) {
    // Recalculada en marcha y sin alternativa razonable hacia delante: hay que dar la vuelta.
    raw.push({
      type: 'uturn',
      edgeIndex: 0,
      street: firstLabel,
      base: (d) => `Da la vuelta cuando sea posible${firstLabel ? ` y sigue por ${firstLabel}` : ''} durante ${formatDistance(d)}`,
    })
  } else if (heading !== undefined) {
    // Recalculada en marcha: se sigue en el sentido en que ya circulas.
    raw.push({
      type: 'depart',
      edgeIndex: 0,
      street: firstLabel,
      base: (d) => `Continúa${firstLabel ? ` por ${firstLabel}` : ' recto'} durante ${formatDistance(d)}`,
    })
  } else {
    raw.push({
      type: 'depart',
      edgeIndex: 0,
      street: firstLabel,
      base: (d) =>
        `${options.resumeFromWaypoint ? 'Desde la parada, dirígete' : 'Dirígete'} hacia el ${departDir}` +
        `${firstLabel ? ` por ${firstLabel}` : ''} durante ${formatDistance(d)}`,
    })
  }

  let i = 1
  while (i < edges.length) {
    const prev = edges[i - 1]
    const next = edges[i]

    // Rotondas: una única maniobra «toma la N.ª salida». Un trocito de anillo (unos metros
    // etiquetados como rotonda dentro de una plaza) por el que sigues en la misma vía no lo es.
    let ringEnd = i
    let ringLength = 0
    while (ringEnd < edges.length && edges[ringEnd].roundabout) ringLength += edges[ringEnd++].distance
    const trivialRing = ringLength < MIN_ROUNDABOUT_M && ringEnd < edges.length && sameRoadAs(prev, edges[ringEnd])
    if (next.roundabout && !prev.roundabout && !trivialRing) {
      const k = ringEnd
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
      const m = junctionManeuver(graph, prev, next, angle, street)
      if (m) raw.push({ ...m, edgeIndex: i })
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
  simplify(raw, cumDist, edges.length)

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

const TURNS = new Set<ManeuverType>(['continue', 'slight-left', 'slight-right', 'left', 'right', 'sharp-left', 'sharp-right', 'uturn'])

/**
 * Maniobra en un cruce normal (sin rotonda ni autovía), o null si no hay nada que decir.
 * Se decide por las ALTERNATIVAS reales del cruce, no solo por el ángulo:
 *  - seguir por la opción claramente más recta (la vía continúa, aunque haga curva en
 *    el cruce) no es una maniobra: solo se avisa si cambia el nombre de la calle;
 *  - si otra salida va casi en la misma dirección, es una bifurcación: «mantente a la…»;
 *  - si no, un giro según el ángulo.
 */
function junctionManeuver(
  graph: RoadGraph,
  prev: GraphEdge,
  next: GraphEdge,
  angle: number,
  street: string | undefined,
): Omit<RawManeuver, 'edgeIndex'> | null {
  const same = sameRoadAs(prev, next)
  // Un cambio de nombre en una calle que sigue igual no se anuncia (el panel muestra la
  // calle actual). Sí el paso a otra carretera (otra referencia) o a otro tipo de vía.
  const renamed =
    !same &&
    !!street &&
    roadLabel(prev) !== street &&
    ((!!next.ref && next.ref !== prev.ref) || roadClass(prev.roadType) !== roadClass(next.roadType))
  const nameChange = (): Omit<RawManeuver, 'edgeIndex'> | null =>
    renamed ? { type: 'continue', street, angle, base: (d) => `Continúa por ${street} durante ${formatDistance(d)}` } : null

  const alts = alternativesAt(graph, prev, next)
  // Sin otra salida: es una curva o el cambio de una vía a otra, no una decisión.
  if (alts.length === 0) return nameChange()

  const inB = endBearing(prev.geometry)
  const altAngles = alts.map((e) => turnAngle(inB, startBearing(e.geometry)))
  const bestAlt = Math.min(...altAngles.map(Math.abs))
  const a = Math.abs(angle)
  if (a < OBVIOUS_MAX_DEG && a + OBVIOUS_MARGIN_DEG <= bestAlt) return nameChange()
  // Sigues por la misma vía, casi recto, y es la salida más recta: tampoco hay decisión.
  if (same && a < 30 && a <= bestAlt) return null

  if (a < 50) {
    // Bifurcación: el lado se decide respecto a la otra salida más parecida.
    const closest = altAngles.reduce((x, y) => (Math.abs(y - angle) < Math.abs(x - angle) ? y : x))
    const right = angle > closest
    return {
      type: right ? 'slight-right' : 'slight-left',
      street,
      angle,
      base: () =>
        `Mantente a la ${right ? 'derecha' : 'izquierda'}${street ? (same ? ` para seguir por ${street}` : ` hacia ${street}`) : ''}`,
    }
  }
  const turn = classifyTurn(angle)
  const verb = TURN_TEXT[turn]!
  return {
    type: turn,
    street,
    angle,
    base: () => `${verb}${street ? (same ? ` para seguir por ${street}` : ` por ${street}`) : ' en la siguiente intersección'}`,
  }
}

/**
 * Limpieza final (no oculta avisos: corrige su generación):
 *  - dos giros a menos de MERGE_WITHIN_M son una sola maniobra (p. ej. cruzar una avenida
 *    con mediana): se suman sus ángulos;
 *  - un «continúa por X» seguido enseguida de otra maniobra sobra: la siguiente ya nombra
 *    la calle a la que vas.
 */
function simplify(raw: RawManeuver[], cumDist: number[], edgeCount: number) {
  const at = (k: number) => cumDist[raw[k].edgeIndex]
  for (let k = 1; k + 1 < raw.length; ) {
    const a = raw[k]
    const b = raw[k + 1]
    if (TURNS.has(a.type) && TURNS.has(b.type) && a.angle !== undefined && b.angle !== undefined && at(k + 1) - at(k) < MERGE_WITHIN_M) {
      const angle = a.angle + b.angle
      const street = b.street
      const turn = classifyTurn(angle)
      if (turn === 'continue') {
        raw.splice(k, 2, ...(street && street !== raw[k - 1].street ? [{ type: 'continue' as const, edgeIndex: a.edgeIndex, street, angle, base: (d: number) => `Continúa por ${street} durante ${formatDistance(d)}` }] : []))
      } else {
        raw.splice(k, 2, {
          type: turn,
          edgeIndex: a.edgeIndex,
          street,
          angle,
          base: () => `${TURN_TEXT[turn]}${street ? ` por ${street}` : ' en la siguiente intersección'}`,
        })
      }
      continue
    }
    k++
  }
  // Justo a la salida de una rotonda, un giro hacia la misma calle que ya se ha anunciado sobra.
  for (let k = raw.length - 1; k >= 1; k--) {
    const p = raw[k - 1]
    if (p.type === 'roundabout' && TURNS.has(raw[k].type) && at(k) - at(k - 1) < MERGE_WITHIN_M * 2 && (!raw[k].street || raw[k].street === p.street)) {
      raw.splice(k, 1)
    }
  }
  // Dos rotondas seguidas (casi pegadas): un único aviso con las dos salidas.
  for (let k = raw.length - 2; k >= 1; k--) {
    const a = raw[k]
    const b = raw[k + 1]
    if (a.type === 'roundabout' && b.type === 'roundabout' && at(k + 1) - at(k) < 40) {
      const street = b.street
      const e1 = a.roundaboutExit ?? 1
      const e2 = b.roundaboutExit ?? 1
      raw.splice(k, 2, {
        ...a,
        street,
        base: () => `En la rotonda, toma la ${e1}.ª salida y, en la siguiente, la ${e2}.ª${street ? ` hacia ${street}` : ''}`,
      })
    }
  }
  // El mismo aviso repetido a pocos metros (p. ej. dos «mantente a la izquierda» por la
  // misma carretera) se da una sola vez.
  for (let k = raw.length - 1; k >= 2; k--) {
    const a = raw[k - 1]
    const b = raw[k]
    if (a.type === b.type && a.street === b.street && TURNS.has(b.type) && at(k) - at(k - 1) < 80) raw.splice(k, 1)
  }
  for (let k = raw.length - 1; k >= 1; k--) {
    if (raw[k].type !== 'continue') continue
    const end = k + 1 < raw.length ? cumDist[raw[k + 1].edgeIndex] : cumDist[edgeCount]
    if (end - cumDist[raw[k].edgeIndex] < MIN_CONTINUE_SEGMENT_M) raw.splice(k, 1)
  }
}
