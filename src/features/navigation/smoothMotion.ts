import { useSyncExternalStore } from 'react'
import { haversine } from '@/utils/distance'

/**
 * Movimiento fluido de la posición en pantalla. El GPS da ~1 lectura por segundo:
 * sin suavizado el marcador salta de una a otra. Aquí la posición mostrada recorre
 * el tramo entre lecturas fotograma a fotograma, con una duración algo mayor que el
 * intervalo entre lecturas para no detenerse antes de que llegue la siguiente.
 */

export interface Tween {
  from: number[]
  to: number[]
  start: number
  duration: number
}

/** Margen sobre el intervalo entre lecturas (el movimiento continúa hasta la siguiente). */
export const OVERSHOOT = 1.15
/** Intervalo máximo considerado (lecturas muy espaciadas no se animan a cámara lenta). */
export const MAX_TWEEN_MS = 1500

export function tweenAt(t: Tween, now: number): number[] {
  if (t.duration <= 0) return t.to
  const k = Math.min(1, Math.max(0, (now - t.start) / t.duration))
  return t.from.map((f, i) => f + (t.to[i] - f) * k)
}

/** Nuevo tramo de animación desde lo que se ve ahora hacia el nuevo objetivo. */
export function retarget(current: number[], target: number[], now: number, sinceLastTarget: number, jump: boolean): Tween {
  const duration = jump ? 0 : Math.min(MAX_TWEEN_MS, Math.max(0, sinceLastTarget) * OVERSHOOT)
  return { from: current, to: target, start: now, duration }
}

/** Valor animado observable desde React (useSyncExternalStore) o desde código imperativo. */
export class SmoothValue {
  private tween: Tween | null = null
  private value: number[] | null = null
  private lastTargetAt: number | null = null
  private raf = 0
  private listeners = new Set<() => void>()
  private readonly isJump: (from: number[], to: number[]) => boolean

  constructor(isJump: (from: number[], to: number[]) => boolean) {
    this.isJump = isJump
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  get = () => this.value

  /** Fija un nuevo objetivo (p. ej. cada lectura del GPS). */
  setTarget(target: number[], now = performance.now()) {
    const current = this.value
    if (!current) {
      this.reset(target)
      return
    }
    const since = this.lastTargetAt === null ? 0 : now - this.lastTargetAt
    this.lastTargetAt = now
    this.tween = retarget(current, target, now, since, this.isJump(current, target))
    this.loop()
  }

  /** Salta sin animar (cambio de ruta, salir de la navegación…). */
  reset(value: number[] | null) {
    cancelAnimationFrame(this.raf)
    this.tween = null
    this.value = value
    this.lastTargetAt = value ? performance.now() : null
    this.emit()
  }

  private loop() {
    cancelAnimationFrame(this.raf)
    const step = () => {
      if (!this.tween) return
      // Mismo reloj que setTarget (performance.now) para no mezclar orígenes de tiempo.
      const now = performance.now()
      this.value = tweenAt(this.tween, now)
      this.emit()
      if (now - this.tween.start < this.tween.duration) this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}

/** Avance (metros) sobre la ruta durante la navegación. Salta en cambios de > 250 m o hacia atrás. */
export const smoothProgress = new SmoothValue(([a], [b]) => Math.abs(b - a) > 250 || b < a - 30)

/** Posición GPS libre (sin navegar): salta si se mueve más de 200 m entre lecturas. */
export const smoothLocation = new SmoothValue(([la, ga], [lb, gb]) => haversine(la, ga, lb, gb) > 200)

export function useSmooth(v: SmoothValue): number[] | null {
  return useSyncExternalStore(v.subscribe, v.get, v.get)
}
