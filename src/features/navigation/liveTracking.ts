import { bearing, haversine, type LatLngTuple } from '@/utils/distance'
import { projectOnSegment } from '@/utils/geometry'
import { angleDiff, initialCourse, updateCourse, type CourseState } from './heading'

/**
 * Seguimiento en tiempo real de una ruta con el GPS del dispositivo.
 * Lógica pura (sin React ni navegador): recibe cada lectura del GPS y devuelve el
 * nuevo estado y, si procede, un evento (desvío, vuelta a la ruta, recalcular, llegada).
 *
 * Además de la distancia a la ruta, se tiene en cuenta el SENTIDO de la marcha: ir por la
 * calle de la ruta pero al revés también es un desvío, y el recálculo parte de tu rumbo.
 */

export interface GpsFix {
  lat: number
  lng: number
  /** Precisión en metros (radio del 68 %). */
  accuracy: number
  /** m/s según el dispositivo, si lo da. */
  speed: number | null
  /** Rumbo del GPS (grados), si lo da. */
  heading?: number | null
  timestamp: number
}

export type TrackingStatus = 'waiting' | 'tracking' | 'weak-signal' | 'off-route' | 'arrived'

export interface TrackerState {
  /** Metros avanzados sobre la ruta. */
  progress: number
  /** Metros realmente recorridos (suma de desplazamientos del GPS). */
  traveled: number
  startedAt: number | null
  lastFix: GpsFix | null
  speedKmh: number | null
  distanceToRoute: number | null
  status: TrackingStatus
  offRouteSince: number | null
  offRouteFixes: number
  /** Metros recorridos (`traveled`) al salirse de la ruta. */
  offRouteTraveled: number | null
  /** Lecturas seguidas circulando por la ruta en sentido contrario. */
  wrongWayFixes: number
  /** El desvío actual es por ir en sentido contrario (no por salirse de la calle). */
  wrongWay: boolean
  lastRerouteAt: number | null
  /** Rumbo estimado (ver heading.ts). */
  course: CourseState
}

export type TrackerEvent = 'none' | 'off-route' | 'back-on-route' | 'reroute' | 'arrived'

/** Lecturas peores que esto no mueven el progreso (se avisa de señal débil). */
export const MAX_USEFUL_ACCURACY = 100
/** Lecturas peores que esto no cuentan como desvío (podría ser solo error del GPS). */
export const MAX_DEVIATION_ACCURACY = 50
/** Lecturas seguidas fuera de la ruta y tiempo mínimo antes de recalcular. */
export const REROUTE_AFTER_FIXES = 3
export const REROUTE_AFTER_MS = 6_000
/** …o bien metros recorridos ya fuera de la ruta (a buena velocidad 6 s es mucho). */
export const REROUTE_AFTER_METERS = 60
export const REROUTE_COOLDOWN_MS = 15_000
/** Sentido contrario: lecturas seguidas necesarias (en marcha) antes de darlo por hecho. */
export const WRONG_WAY_FIXES = 3
export const WRONG_WAY_DEG = 135
export const ARRIVAL_RADIUS = 25
/** Por encima de esto, un desplazamiento entre dos lecturas es un salto del GPS. */
export const MAX_PLAUSIBLE_KMH = 250
/** Sin lecturas durante este tiempo se considera que se ha perdido la señal. */
export const SIGNAL_LOST_MS = 6_000
/** Tiempo máximo que se estima el avance sin señal (túneles) y velocidad mínima para hacerlo. */
export const DEAD_RECKONING_MAX_MS = 30_000
export const DEAD_RECKONING_MIN_KMH = 8

export const initialTracker = (): TrackerState => ({
  progress: 0,
  traveled: 0,
  startedAt: null,
  lastFix: null,
  speedKmh: null,
  distanceToRoute: null,
  status: 'waiting',
  offRouteSince: null,
  offRouteFixes: 0,
  offRouteTraveled: null,
  wrongWayFixes: 0,
  wrongWay: false,
  lastRerouteAt: null,
  course: initialCourse(),
})

/** Tolerancia para considerar que se está en la ruta, según la precisión del GPS. */
export const onRouteTolerance = (accuracy: number) => Math.max(35, Math.min(accuracy * 1.2, 80))
/** Para volver a la ruta hay que acercarse algo más (histéresis: sin parpadeo en el borde). */
export const backOnRouteTolerance = (accuracy: number) => onRouteTolerance(accuracy) * 0.8

export interface RouteLocation {
  offset: number
  distance: number
  /** Rumbo del tramo de la ruta en ese punto. */
  bearing: number
}

/**
 * Proyecta un punto sobre la ruta, priorizando la zona cercana al progreso actual
 * (evita saltar a otro tramo cuando la ruta pasa dos veces por la misma calle). Con
 * un rumbo conocido, se descartan los tramos que van en sentido opuesto (p. ej. una
 * ruta que sube y baja por la misma avenida).
 */
export function locateNear(
  points: readonly LatLngTuple[],
  p: LatLngTuple,
  progress: number,
  tolerance: number,
  course: number | null = null,
): RouteLocation {
  let global: RouteLocation = { offset: 0, distance: Infinity, bearing: 0 }
  let local: RouteLocation = { offset: 0, distance: Infinity, bearing: 0 }
  let globalScore = Infinity
  let localScore = Infinity
  let acc = 0
  const from = progress - 150
  const to = progress + 600
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = haversine(a[0], a[1], b[0], b[1])
    if (seg > 0) {
      const proj = projectOnSegment(p, a, b)
      const offset = acc + seg * proj.t
      const segBearing = bearing(a[0], a[1], b[0], b[1])
      // Un tramo en sentido contrario al de la marcha solo gana si está claramente más cerca.
      const score = proj.distance + (course !== null && angleDiff(course, segBearing) > 100 ? tolerance : 0)
      const cand = { offset, distance: proj.distance, bearing: segBearing }
      if (score < globalScore) [global, globalScore] = [cand, score]
      if (offset >= from && offset <= to && score < localScore) [local, localScore] = [cand, score]
    }
    acc += seg
  }
  return local.distance <= tolerance ? local : global
}

export function updateTracker(
  state: TrackerState,
  fix: GpsFix,
  route: { geometry: readonly LatLngTuple[]; distance: number },
): { state: TrackerState; event: TrackerEvent } {
  const now = fix.timestamp
  const next: TrackerState = { ...state, startedAt: state.startedAt ?? now }

  // Distancia recorrida y velocidad (se filtran el «temblor» en parado y los saltos
  // imposibles del GPS, p. ej. al recuperar señal tras un túnel).
  if (state.lastFix) {
    const moved = haversine(state.lastFix.lat, state.lastFix.lng, fix.lat, fix.lng)
    const dt = (now - state.lastFix.timestamp) / 1000
    const real = moved > Math.max(3, fix.accuracy * 0.5)
    const implied = dt > 0 ? (moved / dt) * 3.6 : Infinity
    const jump = real && (dt < 0.5 || implied > MAX_PLAUSIBLE_KMH)
    if (fix.accuracy <= MAX_USEFUL_ACCURACY && real && !jump) next.traveled += moved
    if (fix.speed !== null && fix.speed >= 0) next.speedKmh = Math.min(fix.speed * 3.6, MAX_PLAUSIBLE_KMH)
    else if (!jump && dt >= 0.5) {
      const derived = real ? implied : 0
      next.speedKmh = state.speedKmh === null ? derived : state.speedKmh * 0.6 + derived * 0.4
    }
  } else if (fix.speed !== null && fix.speed >= 0) next.speedKmh = Math.min(fix.speed * 3.6, MAX_PLAUSIBLE_KMH)
  next.lastFix = fix

  if (state.status === 'arrived') return { state: next, event: 'none' }

  if (fix.accuracy > MAX_USEFUL_ACCURACY) {
    next.status = 'weak-signal'
    return { state: next, event: 'none' }
  }

  const tolerance = onRouteTolerance(fix.accuracy)
  const prevCourse = state.course.moving ? state.course.course : null
  const loc = locateNear(route.geometry, [fix.lat, fix.lng], state.progress, tolerance, prevCourse)
  next.distanceToRoute = loc.distance
  const wasOff = state.status === 'off-route'
  // Para volver a la ruta tras un desvío hay que acercarse un poco más (histéresis).
  const near = loc.distance <= (wasOff ? backOnRouteTolerance(fix.accuracy) : tolerance)

  // Rumbo: la tangente de la ruta solo se ofrece si estás sobre ella.
  next.course = updateCourse(state.course, { ...fix, heading: fix.heading ?? null }, near ? loc.bearing : null)

  // Sentido contrario: en la calle de la ruta, pero avanzando al revés de forma sostenida.
  const measured = next.course.moving ? next.course.measured : null
  const against = near && measured !== null && angleDiff(measured, loc.bearing) >= WRONG_WAY_DEG
  next.wrongWayFixes = against ? state.wrongWayFixes + 1 : 0
  const wrongWay = near && (next.wrongWayFixes >= WRONG_WAY_FIXES || (wasOff && state.wrongWay && against))

  if (near && !wrongWay) {
    // No se retrocede en la ruta por el error del GPS (salvo que realmente vuelvas atrás).
    next.progress = loc.offset
    next.status = 'tracking'
    next.offRouteFixes = 0
    next.offRouteSince = null
    next.offRouteTraveled = null
    next.wrongWay = false
    if (route.distance - loc.offset <= ARRIVAL_RADIUS) {
      next.progress = route.distance
      next.status = 'arrived'
      return { state: next, event: 'arrived' }
    }
    return { state: next, event: wasOff ? 'back-on-route' : 'none' }
  }

  if (!near && fix.accuracy > MAX_DEVIATION_ACCURACY) {
    // Lectura imprecisa lejos de la ruta: no se cuenta como desvío (podría ser el GPS).
    next.status = wasOff ? 'off-route' : 'weak-signal'
    return { state: next, event: 'none' }
  }

  // Fuera de la ruta (o en sentido contrario): se espera a varias lecturas seguidas antes
  // de recalcular, para no hacerlo por un error puntual del GPS.
  next.offRouteFixes = state.offRouteFixes + 1
  next.offRouteSince = state.offRouteSince ?? now
  next.offRouteTraveled = state.offRouteTraveled ?? state.traveled
  next.wrongWay = wrongWay
  const firstTime = !wasOff
  next.status = 'off-route'
  const cooledDown = state.lastRerouteAt === null || now - state.lastRerouteAt >= REROUTE_COOLDOWN_MS
  const offFor = now - next.offRouteSince
  // Metros realmente recorridos desde que te saliste (no una velocidad suavizada).
  const offMeters = next.traveled - next.offRouteTraveled
  const sustained =
    next.offRouteFixes >= REROUTE_AFTER_FIXES && (offFor >= REROUTE_AFTER_MS || offMeters >= REROUTE_AFTER_METERS)
  if (sustained && cooledDown) {
    next.lastRerouteAt = now
    next.offRouteFixes = 0
    next.offRouteSince = null
    next.offRouteTraveled = null
    return { state: next, event: 'reroute' }
  }
  return { state: next, event: firstTime ? 'off-route' : 'none' }
}

/**
 * Sin lecturas del GPS (túnel, edificio): se estima el avance sobre la ruta con la última
 * velocidad, durante un tiempo limitado. Devuelve el progreso estimado o null si no procede.
 */
export function deadReckonProgress(state: TrackerState, now: number, routeDistance: number): number | null {
  const last = state.lastFix
  if (!last || state.status !== 'tracking' || state.speedKmh === null || state.speedKmh < DEAD_RECKONING_MIN_KMH) return null
  const silent = now - last.timestamp
  if (silent < SIGNAL_LOST_MS) return null
  const elapsed = Math.min(silent, DEAD_RECKONING_MAX_MS) / 1000
  return Math.min(routeDistance - ARRIVAL_RADIUS - 1, state.progress + (state.speedKmh / 3.6) * elapsed)
}

/** ¿Se ha perdido la señal (sin lecturas recientes)? */
export const signalLost = (state: TrackerState, now: number) =>
  state.lastFix !== null && now - state.lastFix.timestamp >= SIGNAL_LOST_MS

/**
 * Paradas que quedan por delante según el progreso (para recalcular desde la
 * posición actual sin volver a pasar por paradas ya visitadas).
 */
export function remainingStopIndices(legDistances: number[], progress: number): number[] {
  const out: number[] = []
  let acc = 0
  legDistances.forEach((d, i) => {
    acc += d
    // La parada i+1 está al final del tramo i.
    if (acc > progress + ARRIVAL_RADIUS) out.push(i + 1)
  })
  return out
}
