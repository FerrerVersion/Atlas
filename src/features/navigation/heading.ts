import { bearing, haversine, turnAngle } from '@/utils/distance'

/**
 * Rumbo del usuario durante la navegación (lógica pura, sin React ni navegador).
 *
 * Se distinguen cuatro fuentes y nunca se mezclan sin criterio:
 *  - **orientación del dispositivo** (brújula): NO se usa para la cámara. En un coche el
 *    móvil puede ir en cualquier posición, y en iOS exige un permiso aparte;
 *  - **rumbo del GPS** (`coords.heading`): fiable solo en marcha y con buena precisión;
 *  - **dirección real de desplazamiento**: el rumbo entre lecturas recientes, cuando el
 *    desplazamiento supera claramente el error del GPS;
 *  - **dirección de la ruta**: la tangente de la ruta en el punto en que estás. Es la más
 *    estable (no tiembla con el GPS), pero solo vale si coincide con cómo te mueves.
 *
 * Prioridad: se mide el movimiento (GPS o desplazamiento); si coincide con la ruta se usa
 * la tangente de la ruta (equivale a ajustar el rumbo a la vía); si no coincide, manda el
 * movimiento real. Parado, se conserva el último rumbo: así el mapa no gira solo en un
 * semáforo por el temblor del GPS.
 */

export interface CourseFix {
  lat: number
  lng: number
  accuracy: number
  /** m/s del dispositivo (null si no lo da). */
  speed: number | null
  /** Rumbo del GPS en grados (null/NaN si no lo da o está parado). */
  heading: number | null
  timestamp: number
}

export type CourseSource = 'gps' | 'motion' | 'route' | 'hold'

export interface CourseState {
  /** Lecturas recientes (ventana corta) para medir el desplazamiento real. */
  history: CourseFix[]
  /** Rumbo estimado en grados [0, 360), o null si aún no se conoce. */
  course: number | null
  source: CourseSource | null
  /** Rumbo medido del movimiento (antes de ajustarlo a la ruta), o null. */
  measured: number | null
  moving: boolean
  /** m/s usados para decidir (del GPS o derivados del desplazamiento). */
  speed: number | null
}

/** Ventana de lecturas usada para medir el desplazamiento. */
export const HISTORY_MS = 8_000
/** Histéresis de «en marcha»: se arranca por encima y se para por debajo (m/s). */
export const START_MOVING_MS = 1.4
export const STOP_MOVING_MS = 0.7
/** El rumbo del GPS solo se cree en marcha y con buena precisión. */
export const GPS_HEADING_MIN_SPEED = 2.5
export const GPS_HEADING_MAX_ACCURACY = 30
/** Diferencia máxima entre el movimiento y la ruta para usar la tangente de la ruta. */
export const ROUTE_AGREEMENT_DEG = 50

export const initialCourse = (): CourseState => ({
  history: [],
  course: null,
  source: null,
  measured: null,
  moving: false,
  speed: null,
})

const validHeading = (h: number | null): h is number => h !== null && Number.isFinite(h) && h >= 0

/** Diferencia absoluta entre dos rumbos (0-180). */
export const angleDiff = (a: number, b: number) => Math.abs(turnAngle(a, b))

/**
 * Rumbo del desplazamiento real: desde la lectura más reciente que esté lo bastante
 * lejos como para que el error del GPS no domine (≥ 10 m y ≥ 1,2 × precisión).
 */
export function motionBearing(history: readonly CourseFix[], current: CourseFix): number | null {
  const minDist = Math.max(10, current.accuracy * 1.2)
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h === current) continue
    const d = haversine(h.lat, h.lng, current.lat, current.lng)
    if (d >= minDist) return bearing(h.lat, h.lng, current.lat, current.lng)
  }
  return null
}

/** Velocidad derivada del desplazamiento en la ventana (m/s), para dispositivos sin `speed`. */
function derivedSpeed(history: readonly CourseFix[], current: CourseFix): number | null {
  const oldest = history.find((h) => current.timestamp - h.timestamp >= 1_500)
  if (!oldest) return null
  const d = haversine(oldest.lat, oldest.lng, current.lat, current.lng)
  // Desplazamientos dentro del error del GPS no son movimiento.
  if (d < Math.max(4, current.accuracy * 0.6)) return 0
  return d / ((current.timestamp - oldest.timestamp) / 1000)
}

/**
 * Actualiza el rumbo con una lectura nueva.
 * `routeBearing`: tangente de la ruta donde se te ha situado (null si estás fuera de ella).
 */
export function updateCourse(state: CourseState, fix: CourseFix, routeBearing: number | null): CourseState {
  const history = [...state.history.filter((h) => fix.timestamp - h.timestamp <= HISTORY_MS && h.timestamp < fix.timestamp), fix]
  const speed = fix.speed !== null && fix.speed >= 0 ? fix.speed : derivedSpeed(history, fix)
  const moving = speed === null ? state.moving : state.moving ? speed >= STOP_MOVING_MS : speed >= START_MOVING_MS

  let measured: number | null = null
  let source: CourseSource | null = null
  if (moving) {
    if (validHeading(fix.heading) && (speed ?? 0) >= GPS_HEADING_MIN_SPEED && fix.accuracy <= GPS_HEADING_MAX_ACCURACY) {
      measured = fix.heading % 360
      source = 'gps'
    } else {
      measured = motionBearing(history, fix)
      if (measured !== null) source = 'motion'
    }
  }

  let course = state.course
  if (!moving) {
    // Parado: se conserva el rumbo (o el de la ruta si aún no había ninguno).
    if (course === null && routeBearing !== null) {
      course = routeBearing
      source = 'route'
    } else source = course === null ? null : 'hold'
  } else if (measured !== null) {
    if (routeBearing !== null && angleDiff(measured, routeBearing) <= ROUTE_AGREEMENT_DEG) {
      course = routeBearing
      source = 'route'
    } else course = measured
  } else if (routeBearing !== null) {
    // En marcha pero sin rumbo medible todavía (pocas lecturas): la ruta.
    course = routeBearing
    source = 'route'
  } else source = course === null ? null : 'hold'

  return { history, course, source, measured, moving, speed }
}

/* ------------------------------------------------------------------ */
/* Suavizado del rumbo mostrado (cámara y flecha)                       */
/* ------------------------------------------------------------------ */

/** Constante de tiempo del suavizado (s): ~63 % del giro en este tiempo. */
export const BEARING_TAU_S = 0.45
/** Velocidad máxima de giro de la cámara (°/s): sin latigazos en un cambio brusco. */
export const MAX_TURN_RATE = 140
/** Por debajo de esto no se gira (evita micro-vibraciones). */
export const BEARING_DEADBAND = 1.5

/**
 * Acerca `current` a `target` por el camino corto, con suavizado exponencial y velocidad
 * de giro limitada. Devuelve el nuevo valor normalizado a [0, 360).
 */
export function stepBearing(current: number, target: number, dtSec: number, tau = BEARING_TAU_S, maxRate = MAX_TURN_RATE): number {
  const d = turnAngle(current, target)
  if (Math.abs(d) <= BEARING_DEADBAND) return norm(current)
  const k = 1 - Math.exp(-Math.max(0, dtSec) / tau)
  const maxStep = maxRate * Math.max(0, dtSec)
  const step = Math.max(-maxStep, Math.min(maxStep, d * k))
  return norm(current + step)
}

/** Acerca un valor escalar (inclinación, anclaje…) con suavizado exponencial. */
export function stepScalar(current: number, target: number, dtSec: number, tau = 0.35): number {
  if (Math.abs(target - current) < 0.05) return target
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtSec) / tau))
}

export const norm = (deg: number) => ((deg % 360) + 360) % 360
