import { MAX_PLAUSIBLE_KMH, type TrackerState } from './liveTracking'

/**
 * Telemetría del Modo Rally a partir de la medición real del GPS (liveTracking). Nunca se
 * inventa un valor: sin datos fiables se devuelve null y la interfaz muestra «—».
 */

/** Una lectura más antigua que esto ya no vale para la velocidad actual. */
export const SPEED_MAX_AGE_MS = 5_000
/** Con peor precisión la velocidad del GPS no es fiable. */
export const SPEED_MAX_ACCURACY = 50
/** Por debajo de esto se muestra 0 (el temblor del GPS parado da 1-3 km/h). */
export const STOPPED_KMH = 3

export type SpeedSource = 'gps' | 'simulation'
export interface SpeedReading {
  kmh: number | null
  source: SpeedSource | null
  /** Por qué no hay velocidad (para mostrarlo). */
  reason?: 'no-signal' | 'weak-signal'
}

/** Velocidad actual en km/h (entera), o null con el motivo. */
export function currentSpeed(live: TrackerState, now: number, simulation: { active: boolean; kmh: number }): SpeedReading {
  if (simulation.active) return { kmh: Math.round(simulation.kmh), source: 'simulation' }
  const fix = live.lastFix
  if (!fix || now - fix.timestamp > SPEED_MAX_AGE_MS) return { kmh: null, source: null, reason: 'no-signal' }
  if (fix.accuracy > SPEED_MAX_ACCURACY) return { kmh: null, source: null, reason: 'weak-signal' }
  const v = live.speedKmh
  if (v === null || !Number.isFinite(v) || v < 0 || v > MAX_PLAUSIBLE_KMH) return { kmh: null, source: null, reason: 'no-signal' }
  return { kmh: v < STOPPED_KMH ? 0 : Math.round(v), source: 'gps' }
}

/** Velocidad media del viaje: solo con datos suficientes (≥ 1 min y ≥ 300 m medidos). */
export function averageSpeed(live: TrackerState, now: number): number | null {
  if (live.startedAt === null) return null
  const seconds = (now - live.startedAt) / 1000
  if (seconds < 60 || live.traveled < 300) return null
  return Math.round((live.traveled / seconds) * 3.6)
}

export type GpsQuality = 'good' | 'fair' | 'weak' | 'none' | 'simulation'

/** Calidad de la señal: buena (≤ 15 m), aceptable (≤ 50 m), débil o sin señal. */
export function gpsQuality(live: TrackerState, now: number, simulating: boolean): GpsQuality {
  if (simulating) return 'simulation'
  const fix = live.lastFix
  if (!fix || now - fix.timestamp > SPEED_MAX_AGE_MS) return 'none'
  if (fix.accuracy <= 15) return 'good'
  if (fix.accuracy <= SPEED_MAX_ACCURACY) return 'fair'
  return 'weak'
}

export const GPS_QUALITY_TEXT: Record<GpsQuality, string> = {
  good: 'GPS bueno',
  fair: 'GPS aceptable',
  weak: 'GPS débil',
  none: 'Sin señal GPS',
  simulation: 'Simulación',
}
