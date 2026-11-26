import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_TWEEN_MS, OVERSHOOT, retarget, SmoothValue, tweenAt } from '@/features/navigation/smoothMotion'

describe('movimiento fluido entre lecturas del GPS', () => {
  it('interpola de forma continua entre dos posiciones', () => {
    const t = retarget([0], [100], 1000, 1000, false)
    expect(t.duration).toBeCloseTo(1000 * OVERSHOOT, 6)
    expect(tweenAt(t, 1000)[0]).toBe(0)
    expect(tweenAt(t, 1000 + t.duration / 2)[0]).toBeCloseTo(50, 6)
    expect(tweenAt(t, 1000 + t.duration)[0]).toBe(100)
    expect(tweenAt(t, 99_999)[0]).toBe(100)
  })

  it('dura algo más que el intervalo entre lecturas (no se detiene antes de la siguiente)', () => {
    expect(retarget([0], [10], 0, 1000, false).duration).toBeGreaterThan(1000)
    expect(retarget([0], [10], 0, 60_000, false).duration).toBe(MAX_TWEEN_MS)
  })

  it('los saltos (recalcular ruta, saltar maniobra) no se animan', () => {
    expect(tweenAt(retarget([0], [900], 0, 1000, true), 0)[0]).toBe(900)
  })
})

describe('SmoothValue', () => {
  afterEach(() => vi.useRealTimers())

  it('emite posiciones intermedias en cada fotograma', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const v = new SmoothValue(() => false)
    v.setTarget([0], performance.now())
    vi.advanceTimersByTime(1000)
    const seen: number[] = []
    v.subscribe(() => seen.push(v.get()![0]))
    v.setTarget([100], performance.now())
    for (let f = 0; f < 80; f++) vi.advanceTimersToNextFrame() // ~1,3 s a 60 fps
    const intermediate = seen.filter((x) => x > 0 && x < 100)
    expect(intermediate.length).toBeGreaterThan(30) // ~60 fps durante ~1,15 s
    expect(seen.at(-1)).toBe(100)
    // Siempre avanza (nunca retrocede ni se queda quieto a mitad)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  })

  it('un salto se aplica al instante', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const v = new SmoothValue(([a], [b]) => Math.abs(b - a) > 250)
    v.setTarget([0])
    vi.advanceTimersByTime(1000)
    v.setTarget([1000])
    vi.advanceTimersByTime(20)
    expect(v.get()![0]).toBe(1000)
  })
})
