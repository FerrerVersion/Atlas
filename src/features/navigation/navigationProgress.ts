import { roadLabel } from '@/features/routing/routeInstructions'
import type { Instruction, MultiRoute } from '@/features/routing/routeTypes'
import { pointAlong } from '@/utils/geometry'
import type { LatLngTuple } from '@/utils/distance'

export interface NavigationState {
  /** Instrucción vigente (la última maniobra superada). */
  current: Instruction
  /** Próxima maniobra a anunciar. */
  next: Instruction | null
  nextIndex: number
  distanceToNext: number
  remainingDistance: number
  remainingTime: number
  position: LatLngTuple
  arrived: boolean
}

/**
 * Calcula el estado de navegación a partir de los metros recorridos sobre la ruta.
 * El tiempo restante se interpola con los tiempos acumulados de cada maniobra.
 */
export function navigationState(route: MultiRoute, progress: number): NavigationState {
  const p = Math.max(0, Math.min(progress, route.distance))
  const ins = route.instructions
  let nextIndex = ins.findIndex((i) => i.offset > p + 0.5)
  if (nextIndex === -1) nextIndex = ins.length - 1
  const current = ins[Math.max(0, nextIndex - 1)]
  const next = ins[nextIndex] ?? null
  const arrived = route.distance - p < 15

  // Tiempo transcurrido interpolado dentro del tramo actual.
  const segDist = current.distance || 1
  const frac = Math.min(1, Math.max(0, (p - current.offset) / segDist))
  const elapsed = current.timeOffset + current.duration * frac

  return {
    current,
    next: arrived ? null : next,
    nextIndex,
    distanceToNext: next ? Math.max(0, next.offset - p) : 0,
    remainingDistance: route.distance - p,
    remainingTime: Math.max(0, route.duration - elapsed),
    position: pointAlong(route.geometry, p),
    arrived,
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/* ------------------------------------------------------------------ */
/* Calle actual y avisos por voz                                         */
/* ------------------------------------------------------------------ */

const streetIndex = new WeakMap<MultiRoute, { ends: number[]; labels: (string | undefined)[] }>()

/**
 * Calle por la que se circula en ese punto de la ruta (de los datos de cada tramo, no de
 * la última instrucción: los cambios de nombre sin maniobra no generan instrucción).
 */
export function streetAt(route: MultiRoute, progress: number): string | undefined {
  let idx = streetIndex.get(route)
  if (!idx) {
    const ends: number[] = []
    const labels: (string | undefined)[] = []
    let acc = 0
    for (const leg of route.legs) {
      for (const e of leg.result.edges) {
        acc += e.distance
        ends.push(acc)
        labels.push(roadLabel(e))
      }
    }
    idx = { ends, labels }
    streetIndex.set(route, idx)
  }
  // Búsqueda binaria del tramo que contiene el avance.
  let lo = 0
  let hi = idx.ends.length - 1
  if (hi < 0) return undefined
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (idx.ends[mid] < progress) lo = mid + 1
    else hi = mid
  }
  return idx.labels[lo]
}

export interface VoicePrompt {
  /** Identifica el aviso: el mismo aviso nunca se repite. */
  key: string
  text: string
}

/** Velocidad supuesta si aún no se conoce (≈ 36 km/h). */
const DEFAULT_SPEED_MS = 10
/** Maniobras informativas (no exigen hacer nada): un único aviso breve al llegar. */
const INFORMATIVE = new Set(['continue', 'depart'])

/**
 * Aviso por voz que toca ahora, o null. Lógica pura (la reproducción y el registro de
 * avisos ya dichos van en el hook):
 *  - «prepárate» con antelación según la velocidad (~25 s, entre 200 m y 1,2 km);
 *  - «ahora» al llegar (~7 s, entre 40 y 150 m), encadenando la siguiente si va pegada;
 *  - tras una maniobra, si la siguiente está lejos: «Continúa durante 2 km»;
 *  - los cambios de nombre sin maniobra solo se dicen una vez y sin distancia.
 * Las claves incluyen la ruta: tras recalcular no se repite nada de la anterior ni se
 * anuncian maniobras ya hechas (solo se mira la próxima por delante del avance).
 */
export function voicePrompt(route: MultiRoute, state: NavigationState, speedMs: number | null, routeKey: string): VoicePrompt | null {
  if (state.arrived || !state.next) return { key: `${routeKey}:arrived`, text: 'Has llegado a tu destino' }
  const v = Math.max(speedMs ?? DEFAULT_SPEED_MS, 4)
  const near = Math.min(150, Math.max(40, v * 7))
  const prepare = Math.min(1200, Math.max(200, v * 25))
  const next = state.next
  const d = state.distanceToNext
  const base = `${routeKey}:${state.nextIndex}`

  if (next.type === 'arrive' || next.type === 'waypoint') {
    // La llegada se dice una vez (la misma clave que al confirmar la llegada).
    if (d <= near) return { key: next.type === 'arrive' ? `${routeKey}:arrived` : `${base}:now`, text: next.text }
    if (d <= prepare) return { key: `${base}:prepare`, text: `${next.type === 'arrive' ? 'Tu destino' : 'La parada'} está a ${formatSpoken(d)}` }
    return summary(route, state, base, prepare)
  }
  if (d <= near) {
    const after = route.instructions[state.nextIndex + 1]
    const chained = after && !INFORMATIVE.has(after.type) && after.type !== 'arrive' && after.offset - next.offset < 80
    return { key: `${base}:now`, text: chained ? `${next.text} y enseguida, ${lowerFirst(after.text)}` : next.text }
  }
  if (INFORMATIVE.has(next.type)) return summary(route, state, base, prepare)
  if (d <= prepare) return { key: `${base}:prepare`, text: `En ${formatSpoken(d)}, ${lowerFirst(next.text)}` }
  return summary(route, state, base, prepare)
}

/** Justo después de una maniobra, con la siguiente lejos: cuánto queda por esta vía. */
function summary(route: MultiRoute, state: NavigationState, base: string, prepare: number): VoicePrompt | null {
  const sinceManeuver = route.distance - state.remainingDistance - state.current.offset
  if (sinceManeuver > 60 || state.distanceToNext < prepare + 300) return null
  const street = streetAt(route, route.distance - state.remainingDistance + 1)
  return { key: `${base}:summary`, text: `Continúa${street ? ` por ${street}` : ''} durante ${formatSpoken(state.distanceToNext)}` }
}

/** Distancias redondeadas como se dicen (no «340 m» sino «350 metros»). */
export function formatSpoken(m: number): string {
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10
    return `${km.toString().replace('.', ',')} ${km === 1 ? 'kilómetro' : 'kilómetros'}`
  }
  const r = m >= 300 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)
  return `${r} metros`
}
