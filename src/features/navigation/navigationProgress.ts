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

/** Texto hablado/mostrado para la próxima maniobra. */
export function announce(state: NavigationState, formatDistance: (m: number) => string): string {
  if (state.arrived || !state.next) return 'Has llegado a tu destino'
  if (state.next.type === 'arrive') return `Tu destino está a ${formatDistance(state.distanceToNext)}`
  return `En ${formatDistance(state.distanceToNext)}, ${lowerFirst(state.next.text)}`
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
