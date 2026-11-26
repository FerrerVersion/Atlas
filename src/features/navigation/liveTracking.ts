import { haversine, type LatLngTuple } from '@/utils/distance'
import { projectOnSegment } from '@/utils/geometry'

/**
 * Seguimiento en tiempo real de una ruta con el GPS del dispositivo.
 * Lógica pura (sin React ni navegador): recibe cada lectura del GPS y devuelve el
 * nuevo estado y, si procede, un evento (desvío, vuelta a la ruta, recalcular, llegada).
 */

export interface GpsFix {
  lat: number
  lng: number
  /** Precisión en metros (radio del 68 %). */
  accuracy: number
  /** m/s según el dispositivo, si lo da. */
  speed: number | null
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
  lastRerouteAt: number | null
}

export type TrackerEvent = 'none' | 'off-route' | 'back-on-route' | 'reroute' | 'arrived'

/** Lecturas peores que esto no mueven el progreso (se avisa de señal débil). */
export const MAX_USEFUL_ACCURACY = 100
/** Lecturas seguidas fuera de la ruta y tiempo mínimo antes de recalcular. */
export const REROUTE_AFTER_FIXES = 3
export const REROUTE_AFTER_MS = 6_000
export const REROUTE_COOLDOWN_MS = 15_000
export const ARRIVAL_RADIUS = 25
/** Por encima de esto, un desplazamiento entre dos lecturas es un salto del GPS. */
export const MAX_PLAUSIBLE_KMH = 250

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
  lastRerouteAt: null,
})

/** Tolerancia para considerar que se está en la ruta, según la precisión del GPS. */
export const onRouteTolerance = (accuracy: number) => Math.max(35, Math.min(accuracy * 1.2, 80))

/**
 * Proyecta un punto sobre la ruta, priorizando la zona cercana al progreso actual
 * (evita saltar a otro tramo cuando la ruta pasa dos veces por la misma calle).
 */
export function locateNear(points: readonly LatLngTuple[], p: LatLngTuple, progress: number, tolerance: number) {
  let global = { offset: 0, distance: Infinity }
  let local = { offset: 0, distance: Infinity }
  let acc = 0
  const from = progress - 150
  const to = progress + 600
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    const proj = projectOnSegment(p, points[i - 1], points[i])
    const offset = acc + seg * proj.t
    if (proj.distance < global.distance) global = { offset, distance: proj.distance }
    if (offset >= from && offset <= to && proj.distance < local.distance) local = { offset, distance: proj.distance }
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
  const loc = locateNear(route.geometry, [fix.lat, fix.lng], state.progress, tolerance)
  next.distanceToRoute = loc.distance

  if (loc.distance <= tolerance) {
    const wasOff = state.status === 'off-route'
    next.progress = loc.offset
    next.status = 'tracking'
    next.offRouteFixes = 0
    next.offRouteSince = null
    if (route.distance - loc.offset <= ARRIVAL_RADIUS) {
      next.progress = route.distance
      next.status = 'arrived'
      return { state: next, event: 'arrived' }
    }
    return { state: next, event: wasOff ? 'back-on-route' : 'none' }
  }

  // Fuera de la ruta: se espera a varias lecturas seguidas antes de recalcular.
  next.offRouteFixes = state.offRouteFixes + 1
  next.offRouteSince = state.offRouteSince ?? now
  const firstTime = state.status !== 'off-route'
  next.status = 'off-route'
  const cooledDown = state.lastRerouteAt === null || now - state.lastRerouteAt >= REROUTE_COOLDOWN_MS
  if (next.offRouteFixes >= REROUTE_AFTER_FIXES && now - next.offRouteSince >= REROUTE_AFTER_MS && cooledDown) {
    next.lastRerouteAt = now
    next.offRouteFixes = 0
    next.offRouteSince = null
    return { state: next, event: 'reroute' }
  }
  return { state: next, event: firstTime ? 'off-route' : 'none' }
}

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
