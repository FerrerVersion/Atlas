import { roadLabel } from '@/features/routing/routeInstructions'
import type { Instruction, MultiRoute } from '@/features/routing/routeTypes'
import { bearing, haversine, turnAngle, type LatLngTuple } from '@/utils/distance'

/**
 * Notas de copiloto (Modo Rally) generadas a partir de la geometría REAL de la ruta.
 *
 * A diferencia de las instrucciones normales (que solo avisan cuando hay una decisión en
 * un cruce), un copiloto canta también las curvas de la carretera. Por eso aquí se
 * combinan dos fuentes, sin inventar nada:
 *  - curvas de la vía: se miden los cambios de rumbo en los vértices de la geometría OSM
 *    y se agrupan los vértices consecutivos que giran hacia el mismo lado;
 *  - maniobras de la ruta (giros en cruces, rotondas, incorporaciones, salidas, cambio de
 *    vía, paradas y llegada): salen de las instrucciones ya calculadas.
 * Las curvas por debajo de 20° no se cantan (la vía sigue): el tramo cuenta como recta.
 * Lógica pura y memorizada por ruta: al recalcular, la ruta nueva trae notas nuevas.
 */

export type CurveClass = 'very-gentle' | 'gentle' | 'medium' | 'tight' | 'very-tight' | 'hairpin'
export type NoteKind = 'curve' | 'junction' | 'roundabout' | 'merge' | 'exit' | 'road' | 'waypoint' | 'arrive'

export interface PaceNote {
  kind: NoteKind
  direction: 'left' | 'right' | null
  /** Giro total con signo (+ derecha), en grados, medido sobre la geometría. */
  angle: number
  curve: CurveClass | null
  /** Metros desde el inicio de la ruta donde empieza y termina la maniobra. */
  start: number
  end: number
  /** Radio estimado (m) o null si la geometría no lo permite. */
  radius: number | null
  /** El ángulo sale de pocos vértices: se muestra como aproximado (≈). */
  approximate: boolean
  /** La siguiente nota empieza enseguida («… Y IZQUIERDA 90»). */
  into: boolean
  street?: string
  roundaboutExit?: number
}

/** Por debajo de este giro total no es una curva que cantar. */
export const MIN_CURVE_DEG = 20
/** Vértices que giran menos que esto son ruido de la geometría. */
const VERTEX_NOISE_DEG = 2
/** Hueco máximo entre vértices que giran al mismo lado para considerarlos la misma curva. */
const SAME_CURVE_GAP_M = 30
/** Distancia máxima entre dos notas para encadenarlas («… Y …»). */
export const INTO_GAP_M = 40
/** Una maniobra de la ruta absorbe la curva de la geometría que coincide con ella. */
const MATCH_RADIUS_M = 30

export function classifyCurve(angle: number): CurveClass | null {
  const a = Math.abs(angle)
  if (a < MIN_CURVE_DEG) return null
  if (a < 35) return 'very-gentle'
  if (a < 60) return 'gentle'
  if (a < 90) return 'medium'
  if (a < 120) return 'tight'
  if (a < 150) return 'very-tight'
  return 'hairpin'
}

const ORDER: CurveClass[] = ['very-gentle', 'gentle', 'medium', 'tight', 'very-tight', 'hairpin']

/** Clase por el radio (lo cerrada que es la curva), solo si la geometría permite medirlo. */
export function classifyRadius(radius: number): CurveClass {
  if (radius > 150) return 'very-gentle'
  if (radius > 90) return 'gentle'
  if (radius > 50) return 'medium'
  if (radius > 25) return 'tight'
  return 'very-tight'
}

/**
 * Clase final de una curva de la vía: cuánto gira (ángulo) y lo cerrada que es (radio).
 * Se queda con la más suave de las dos: una curva larga y abierta de 160° no es una
 * horquilla, y un quiebro de 25° tampoco es un giro cerrado. Horquilla = da la vuelta
 * (≥ 150°) con radio pequeño (≤ 50 m) o no medible.
 */
export function curveClass(angle: number, radius: number | null, approximate: boolean): CurveClass | null {
  const byAngle = classifyCurve(angle)
  if (!byAngle) return null
  const measurable = !approximate && radius !== null
  if (byAngle === 'hairpin') return !measurable || radius! <= 50 ? 'hairpin' : gentler('very-tight', classifyRadius(radius!))
  return measurable ? gentler(byAngle, classifyRadius(radius!)) : byAngle
}

const gentler = (a: CurveClass, b: CurveClass) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b)

export const CURVE_NAMES: Record<CurveClass, string> = {
  'very-gentle': 'Curva muy suave',
  gentle: 'Curva suave',
  medium: 'Curva media',
  tight: 'Curva cerrada',
  'very-tight': 'Giro muy cerrado',
  hairpin: 'Horquilla',
}

/** Ángulo redondeado (la geometría OSM no da más precisión): de 5 en 5 hasta 45°, luego de 15 en 15. */
export const roundAngle = (deg: number) => {
  const a = Math.abs(deg)
  return a < 45 ? Math.max(5, Math.round(a / 5) * 5) : Math.round(a / 15) * 15
}

interface Vertex {
  offset: number
  turn: number
  lenIn: number
  lenOut: number
}

/** Cambio de rumbo en cada vértice interior de la polilínea (tramos de < 1 m se funden). */
function vertexTurns(geometry: readonly LatLngTuple[]): Vertex[] {
  const pts: LatLngTuple[] = []
  for (const p of geometry) {
    const last = pts[pts.length - 1]
    if (!last || haversine(last[0], last[1], p[0], p[1]) >= 1) pts.push(p)
  }
  const out: Vertex[] = []
  let acc = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]]
    const lenIn = haversine(a[0], a[1], b[0], b[1])
    const lenOut = haversine(b[0], b[1], c[0], c[1])
    acc += lenIn
    const turn = turnAngle(bearing(a[0], a[1], b[0], b[1]), bearing(b[0], b[1], c[0], c[1]))
    out.push({ offset: acc, turn, lenIn, lenOut })
  }
  return out
}

/** Curvas de la vía: vértices consecutivos que giran al mismo lado, sin huecos largos. */
export function geometryCurves(geometry: readonly LatLngTuple[]): PaceNote[] {
  const vs = vertexTurns(geometry).filter((v) => Math.abs(v.turn) >= VERTEX_NOISE_DEG)
  const curves: PaceNote[] = []
  let group: Vertex[] = []
  const flush = () => {
    if (group.length === 0) return
    const angle = group.reduce((s, v) => s + v.turn, 0)
    if (classifyCurve(angle)) {
      const first = group[0]
      const last = group[group.length - 1]
      const rad = (Math.abs(angle) * Math.PI) / 180
      // Radio: arco entre el primer y el último vértice (más medio tramo a cada lado si es
      // un solo vértice, como en travelTime.ts). Con 1-2 vértices es una esquina: aproximado.
      const arc = last.offset - first.offset + Math.min(first.lenIn, 25) / 2 + Math.min(last.lenOut, 25) / 2
      const approximate = group.length < 3
      const curve = curveClass(angle, arc / rad, approximate)!
      curves.push({
        kind: 'curve',
        direction: angle > 0 ? 'right' : 'left',
        angle,
        curve,
        start: Math.max(0, first.offset - Math.min(first.lenIn / 2, 15)),
        end: last.offset + Math.min(last.lenOut / 2, 15),
        radius: arc / rad,
        approximate,
        into: false,
      })
    }
    group = []
  }
  for (const v of vs) {
    const prev = group[group.length - 1]
    if (prev && (Math.sign(prev.turn) !== Math.sign(v.turn) || v.offset - prev.offset > SAME_CURVE_GAP_M)) flush()
    group.push(v)
  }
  flush()
  return curves
}

const ROUTE_KINDS: Partial<Record<Instruction['type'], NoteKind>> = {
  roundabout: 'roundabout',
  'merge-highway': 'merge',
  'exit-highway': 'exit',
  continue: 'road',
  waypoint: 'waypoint',
  arrive: 'arrive',
}

/** Tramos de la ruta que van por una rotonda (sus curvas no se cantan una a una). */
function roundaboutRanges(route: MultiRoute): [number, number][] {
  const ranges: [number, number][] = []
  let acc = 0
  for (const leg of route.legs) {
    for (const e of leg.result.edges) {
      if (e.roundabout) {
        const last = ranges[ranges.length - 1]
        if (last && Math.abs(last[1] - acc) < 1) last[1] = acc + e.distance
        else ranges.push([acc, acc + e.distance])
      }
      acc += e.distance
    }
  }
  return ranges
}

const cache = new WeakMap<MultiRoute, PaceNote[]>()

/** Todas las notas de la ruta, en orden. Memorizado por ruta (una ruta nueva = notas nuevas). */
export function paceNotes(route: MultiRoute): PaceNote[] {
  const hit = cache.get(route)
  if (hit) return hit
  const rings = roundaboutRanges(route)
  const inRing = (n: PaceNote) => rings.some(([a, b]) => n.end > a - 5 && n.start < b + 5)
  let curves = geometryCurves(route.geometry).filter((c) => !inRing(c))

  const fromRoute: PaceNote[] = []
  for (const ins of route.instructions) {
    if (ins.type === 'depart') continue
    const kind = ROUTE_KINDS[ins.type] ?? 'junction'
    const angle = ins.angle ?? 0
    // La maniobra absorbe las curvas de la geometría en ese punto (es el mismo giro): su
    // ángulo es el del cruce, medido a 20 m a cada lado del nodo.
    const near = (c: PaceNote) => Math.abs(c.start - ins.offset) <= MATCH_RADIUS_M || (ins.offset >= c.start && ins.offset <= c.end)
    const matched = kind === 'junction' ? curves.filter(near) : []
    if (matched.length) curves = curves.filter((c) => !matched.includes(c))
    const radius = matched.length ? Math.min(...matched.map((c) => c.radius ?? Infinity)) : Infinity
    const ring = kind === 'roundabout' ? rings.find(([a]) => Math.abs(a - ins.offset) < 20) : undefined
    // Si la curva de la vía en el cruce gira al mismo lado y más, refleja mejor el giro real
    // (la esquina redondeada que se recorre); si no, el ángulo medido en el nodo.
    const geo = matched.filter((c) => Math.sign(c.angle) === Math.sign(angle)).reduce((s, c) => s + c.angle, 0)
    const turnDeg = Math.abs(geo) > Math.abs(angle) ? geo : angle
    const side = turnDeg > 0 ? 'right' : 'left'
    fromRoute.push({
      kind,
      direction: kind === 'junction' ? side : kind === 'roundabout' ? null : Math.abs(turnDeg) > 15 ? side : null,
      angle: turnDeg,
      // Un desvío de menos de 20° en un cruce es una bifurcación: «MANTENTE …», sin clase.
      curve: kind === 'junction' ? classifyCurve(turnDeg) : null,
      start: ins.offset,
      end: ring ? ring[1] : matched.length ? Math.max(ins.offset, ...matched.map((c) => c.end)) : ins.offset,
      radius: Number.isFinite(radius) ? radius : null,
      approximate: matched.length === 0 || matched.every((c) => c.approximate),
      into: false,
      street: ins.street ?? (kind === 'arrive' || kind === 'waypoint' ? undefined : streetAfter(route, ins.offset)),
      roundaboutExit: ins.roundaboutExit,
    })
  }
  const notes = [...curves, ...fromRoute].sort((a, b) => a.start - b.start)
  for (let i = 0; i + 1 < notes.length; i++) {
    const n = notes[i]
    const next = notes[i + 1]
    n.into = n.kind !== 'arrive' && next.kind !== 'arrive' && next.start - n.end <= INTO_GAP_M
  }
  cache.set(route, notes)
  return notes
}

function streetAfter(route: MultiRoute, offset: number): string | undefined {
  let acc = 0
  for (const leg of route.legs) {
    for (const e of leg.result.edges) {
      acc += e.distance
      if (acc > offset + 1) return roadLabel(e)
    }
  }
  return undefined
}

export interface RallyState {
  /** Nota en curso o la próxima (la que hay que preparar). */
  current: PaceNote | null
  /** La siguiente a la actual. */
  next: PaceNote | null
  /** Las 4 próximas (la actual primero). */
  sequence: PaceNote[]
  /** Metros hasta el inicio de la nota actual (0 si ya estás dentro). */
  distance: number
  /** Metros de recta antes de la nota actual (desde el final de la anterior). */
  straightBefore: number
  /** 0 → 1 a medida que te acercas a la nota actual (se reinicia con cada nota). */
  approach: number
  /** Ya estás haciendo la maniobra actual. */
  inside: boolean
  /** Dentro de la maniobra: parte ya recorrida (0 → 1). */
  completion: number
}

/** Ventana máxima de la barra de anticipación (m). */
export const APPROACH_WINDOW_M = 400

/**
 * Estado del copiloto para un avance dado. Una nota sigue siendo la actual mientras la
 * recorres; al salir de ella pasa a la siguiente.
 */
export function rallyState(route: MultiRoute, progress: number): RallyState {
  const notes = paceNotes(route)
  const idx = notes.findIndex((n) => n.end > progress + 1 || n.kind === 'arrive')
  if (idx === -1) return { current: null, next: null, sequence: [], distance: 0, straightBefore: 0, approach: 1, inside: false, completion: 1 }
  const current = notes[idx]
  const prevEnd = idx > 0 ? notes[idx - 1].end : 0
  const distance = Math.max(0, current.start - progress)
  const window = Math.min(APPROACH_WINDOW_M, Math.max(1, current.start - prevEnd))
  return {
    current,
    next: notes[idx + 1] ?? null,
    sequence: notes.slice(idx, idx + 4),
    distance,
    straightBefore: Math.max(0, current.start - Math.max(prevEnd, progress)),
    approach: Math.min(1, Math.max(0, 1 - distance / window)),
    inside: progress >= current.start,
    completion: current.end > current.start ? Math.min(1, Math.max(0, (progress - current.start) / (current.end - current.start))) : progress >= current.start ? 1 : 0,
  }
}

/* ------------------------------------------------------------------ */
/* Textos de la nota (cortos, en mayúsculas, como las de un copiloto)   */
/* ------------------------------------------------------------------ */

const DIR = { left: 'IZQUIERDA', right: 'DERECHA' } as const

/** Texto principal: «IZQUIERDA 90°», «HORQUILLA DERECHA», «ROTONDA 2.ª SALIDA»… */
export function noteLabel(n: PaceNote): string {
  switch (n.kind) {
    case 'roundabout':
      return n.roundaboutExit ? `ROTONDA ${n.roundaboutExit}.ª SALIDA` : 'ROTONDA'
    case 'merge':
      return 'INCORPORACIÓN'
    case 'exit':
      return `SALIDA${n.direction ? ` ${DIR[n.direction]}` : ''}`
    case 'road':
      return 'CAMBIO DE VÍA'
    case 'waypoint':
      return 'PARADA'
    case 'arrive':
      return 'LLEGADA'
    default: {
      const dir = DIR[n.direction ?? 'right']
      if (n.kind === 'junction' && !n.curve) return `MANTENTE A LA ${dir}`
      if (n.curve === 'hairpin') return `HORQUILLA ${dir}`
      return `${dir} ${n.approximate ? '≈' : ''}${roundAngle(n.angle)}°`
    }
  }
}

/** Texto corto para la secuencia y para encadenar («DER 60»). */
export function shortLabel(n: PaceNote): string {
  if (n.kind === 'curve' || n.kind === 'junction') {
    const d = n.direction === 'left' ? 'IZQ' : 'DER'
    if (n.kind === 'junction' && !n.curve) return `MANT ${d}`
    return n.curve === 'hairpin' ? `HORQ ${d}` : `${d} ${roundAngle(n.angle)}`
  }
  return noteLabel(n).replace(' SALIDA', '').replace('INCORPORACIÓN', 'INCORP.').replace('CAMBIO DE VÍA', 'CAMBIO')
}

/** Descripción secundaria: tipo de curva o lo que es la maniobra. */
export function noteDetail(n: PaceNote): string {
  if (n.kind === 'junction') return n.curve ? `${CURVE_NAMES[n.curve]} · cruce` : 'Bifurcación'
  if (n.kind === 'curve') return n.curve ? CURVE_NAMES[n.curve] : 'Curva'
  if (n.kind === 'roundabout') return 'Rotonda'
  if (n.kind === 'merge') return 'Incorporación'
  if (n.kind === 'exit') return 'Salida'
  if (n.kind === 'road') return 'Cambio de carretera'
  if (n.kind === 'waypoint') return 'Parada intermedia'
  return 'Destino'
}

/** Recta redondeada como la cantaría un copiloto: «RECTA 300». */
export const straightLabel = (m: number) => `RECTA ${m >= 1000 ? `${(Math.round(m / 100) / 10).toString().replace('.', ',')} KM` : Math.round(m / 50) * 50}`
