import { bearing, haversine, turnAngle, type LatLngTuple } from '@/utils/distance'
import type { ManeuverType } from './routeTypes'

/**
 * Tiempo de recorrido realista de un tramo: además del límite de velocidad, las
 * curvas obligan a frenar. En cada vértice se estima el radio de la curva y la
 * velocidad cómoda para tomarla: v = √(a · R), con a = aceleración lateral.
 */

/** Aceleración lateral cómoda para un turismo (≈ 0,27 g). */
export const LATERAL_ACCEL = 2.6
/** Longitud máxima usada para estimar el radio en un vértice (evita radios enormes en esquinas con tramos largos). */
const MAX_ARC = 50
/** Ángulos menores se consideran recta (ruido de la geometría). */
const MIN_ANGLE_RAD = (4 * Math.PI) / 180

/** Velocidad máxima (m/s) en cada vértice de la geometría. Los extremos van al límite. */
export function vertexSpeeds(geometry: readonly LatLngTuple[], limitKmh: number, accel = LATERAL_ACCEL): number[] {
  const vmax = limitKmh / 3.6
  const n = geometry.length
  const speeds = new Array<number>(n).fill(vmax)
  for (let i = 1; i < n - 1; i++) {
    const [a, b, c] = [geometry[i - 1], geometry[i], geometry[i + 1]]
    const l1 = haversine(a[0], a[1], b[0], b[1])
    const l2 = haversine(b[0], b[1], c[0], c[1])
    if (l1 < 0.5 || l2 < 0.5) continue
    const theta = (Math.abs(turnAngle(bearing(a[0], a[1], b[0], b[1]), bearing(b[0], b[1], c[0], c[1]))) * Math.PI) / 180
    if (theta < MIN_ANGLE_RAD) continue
    const radius = Math.min(l1, l2, MAX_ARC) / theta
    speeds[i] = Math.min(vmax, Math.sqrt(accel * radius))
  }
  return speeds
}

/** Aceleración y frenada habituales (m/s²) entre curva y curva. */
export const ACCELERATION = 1.2
export const DECELERATION = 2.0

/**
 * Segundos para recorrer la geometría con un límite dado. Perfil de velocidad realista:
 *  1. velocidad máxima en cada curva según su radio;
 *  2. hacia delante: tras una curva no se recupera el límite al instante (aceleración);
 *  3. hacia atrás: hay que frenar ANTES de la siguiente curva (deceleración).
 * Cada segmento se recorre a la media de las velocidades de sus extremos.
 */
export function curveAwareTime(geometry: readonly LatLngTuple[], limitKmh: number, accel = LATERAL_ACCEL): number {
  if (geometry.length < 2 || limitKmh <= 0) return 0
  const v = vertexSpeeds(geometry, limitKmh, accel)
  const len: number[] = []
  for (let i = 1; i < geometry.length; i++) {
    len.push(haversine(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1]))
  }
  for (let i = 1; i < v.length; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * ACCELERATION * len[i - 1]))
  for (let i = v.length - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * DECELERATION * len[i]))
  let t = 0
  for (let i = 0; i < len.length; i++) t += len[i] / Math.max((v[i] + v[i + 1]) / 2, 0.5)
  return t
}

/** Segundos que cuesta cada tipo de maniobra (frenar, ceder, girar y volver a acelerar). */
export const MANEUVER_SECONDS: Partial<Record<ManeuverType, number>> = {
  'slight-left': 2,
  'slight-right': 2,
  left: 7,
  right: 5,
  'sharp-left': 10,
  'sharp-right': 8,
  uturn: 20,
  roundabout: 8,
  'merge-highway': 5,
  'exit-highway': 4,
}
