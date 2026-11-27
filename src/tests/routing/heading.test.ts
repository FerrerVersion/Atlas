import { describe, expect, it } from 'vitest'
import { angleDiff, initialCourse, stepBearing, updateCourse, type CourseFix, type CourseState } from '@/features/navigation/heading'
import {
  deadReckonProgress,
  initialTracker,
  REROUTE_AFTER_MS,
  SIGNAL_LOST_MS,
  updateTracker,
  type GpsFix,
  type TrackerState,
} from '@/features/navigation/liveTracking'
import type { LatLngTuple } from '@/utils/distance'

// En el ecuador 0,0001° ≈ 11,1 m.
const M = 1 / 111_320
const at = (east: number, north: number, t: number, extra: Partial<CourseFix> = {}): CourseFix => ({
  lat: north * M,
  lng: east * M,
  accuracy: 8,
  speed: null,
  heading: null,
  timestamp: t,
  ...extra,
})

function drive(fixes: CourseFix[], routeBearing: (f: CourseFix) => number | null = () => null, start = initialCourse()) {
  let s: CourseState = start
  const out: CourseState[] = []
  for (const f of fixes) {
    s = updateCourse(s, f, routeBearing(f))
    out.push(s)
  }
  return { s, out }
}

describe('rumbo del usuario (heading.ts)', () => {
  it('línea recta hacia el este: rumbo 90° por el desplazamiento real', () => {
    const fixes = Array.from({ length: 6 }, (_, i) => at(i * 14, 0, i * 1000)) // 14 m/s ≈ 50 km/h
    const { s } = drive(fixes)
    expect(s.moving).toBe(true)
    expect(s.source).toBe('motion')
    expect(angleDiff(s.course!, 90)).toBeLessThan(2)
  })

  it('usa el rumbo del GPS cuando es fiable (en marcha y preciso)', () => {
    const fixes = [at(0, 0, 0, { speed: 12, heading: 92 }), at(12, 0, 1000, { speed: 12, heading: 91 })]
    const { s } = drive(fixes)
    expect(s.source).toBe('gps')
    expect(s.course).toBe(91)
  })

  it('no cree el rumbo del GPS a poca velocidad', () => {
    const fixes = [at(0, 0, 0, { speed: 1.6, heading: 300 }), at(1.6, 0, 1000, { speed: 1.6, heading: 10 })]
    const { s } = drive(fixes, () => 90)
    expect(s.source).toBe('route')
    expect(s.course).toBe(90)
  })

  it('en una curva sigue la tangente de la ruta mientras coincide con el movimiento', () => {
    // Curva suave de este (90°) a noreste: el movimiento coincide con la ruta (±50°).
    const fixes = [at(0, 0, 0), at(14, 0, 1000), at(27, 3, 2000), at(39, 9, 3000), at(49, 18, 4000)]
    const tangent = [90, 90, 78, 64, 50]
    let i = 0
    const { out } = drive(fixes, () => tangent[i++])
    expect(out.at(-1)!.source).toBe('route')
    expect(out.map((s) => s.course)).toEqual([90, 90, 78, 64, 50])
  })

  it('giro real fuera de lo previsto: manda el movimiento, no la ruta', () => {
    // La ruta sigue al este, pero el usuario gira al norte.
    const fixes = [at(0, 0, 0), at(14, 0, 1000), at(28, 0, 2000), at(28, 14, 3000), at(28, 28, 4000)]
    const { s } = drive(fixes, () => 90)
    expect(s.source).toBe('motion')
    expect(angleDiff(s.course!, 0)).toBeLessThan(5)
  })

  it('parado en un semáforo: el temblor del GPS no cambia el rumbo', () => {
    const moving = Array.from({ length: 4 }, (_, i) => at(i * 14, 0, i * 1000))
    // 20 s parado con ±4 m de ruido en todas direcciones.
    const jitter = Array.from({ length: 20 }, (_, i) => at(42 + Math.sin(i * 2.1) * 4, Math.cos(i * 1.7) * 4, 4000 + i * 1000, { speed: 0.3, heading: (i * 97) % 360 }))
    const { out } = drive([...moving, ...jitter])
    const stopped = out.slice(6)
    expect(stopped.every((s) => !s.moving)).toBe(true)
    expect(stopped.every((s) => angleDiff(s.course!, 90) < 2)).toBe(true)
  })

  it('GPS impreciso: el desplazamiento debe superar el error antes de medir un rumbo', () => {
    const fixes = [at(0, 0, 0, { accuracy: 40 }), at(8, 20, 1000, { accuracy: 40 }), at(4, -15, 2000, { accuracy: 40 })]
    const { s } = drive(fixes)
    expect(s.course).toBeNull()
  })

  it('suavizado: gira por el camino corto, sin pasarse ni vibrar', () => {
    let b = 350
    for (let i = 0; i < 120; i++) b = stepBearing(b, 20, 1 / 60)
    expect(angleDiff(b, 20)).toBeLessThan(2)
    // Un salto de 180° no se hace de golpe (velocidad de giro limitada).
    expect(angleDiff(stepBearing(0, 180, 0.1), 0)).toBeLessThanOrEqual(14.1)
    // Dentro de la banda muerta no se mueve.
    expect(stepBearing(90, 91, 1 / 60)).toBe(90)
  })
})

/* ------------------------------------------------------------------ */
/* Seguimiento con sentido de la marcha                                 */
/* ------------------------------------------------------------------ */

// Ruta recta de ~1,1 km hacia el este.
const geometry: LatLngTuple[] = Array.from({ length: 11 }, (_, i) => [0, i * 0.001])
const route = { geometry, distance: 1113.2 }
const gps = (east: number, north: number, t: number, extra: Partial<GpsFix> = {}): GpsFix => ({
  lat: north * M,
  lng: east * M,
  accuracy: 8,
  speed: null,
  timestamp: t,
  ...extra,
})

function track(fixes: GpsFix[], start: TrackerState = initialTracker()) {
  let s = start
  const events: string[] = []
  for (const f of fixes) {
    const r = updateTracker(s, f, route)
    s = r.state
    events.push(r.event)
  }
  return { s, events }
}

describe('desvíos y recálculo según el sentido de la marcha', () => {
  it('desvío ligero (20 m, dentro de la tolerancia): no avisa ni recalcula', () => {
    const fixes = Array.from({ length: 12 }, (_, i) => gps(i * 12, i % 2 ? 20 : 12, i * 1000))
    const { events, s } = track(fixes)
    expect(events.every((e) => e === 'none')).toBe(true)
    expect(s.status).toBe('tracking')
  })

  it('lecturas imprecisas lejos de la ruta no cuentan como desvío', () => {
    const fixes = [gps(0, 0, 0), ...Array.from({ length: 8 }, (_, i) => gps(i * 10, 90, 1000 + i * 1000, { accuracy: 70 }))]
    const { events } = track(fixes)
    expect(events).not.toContain('reroute')
    expect(events).not.toContain('off-route')
  })

  it('otra calle en la misma dirección general: recalcula una sola vez y con el rumbo', () => {
    // Avanza por la ruta y luego toma una paralela 120 m al norte, siempre hacia el este.
    const on = Array.from({ length: 4 }, (_, i) => gps(i * 14, 0, i * 1000))
    const off = Array.from({ length: 10 }, (_, i) => gps(56 + i * 14, 120, 4000 + i * 1000))
    const { events, s } = track([...on, ...off])
    expect(events.filter((e) => e === 'reroute')).toHaveLength(1)
    expect(events.filter((e) => e === 'off-route')).toHaveLength(1)
    expect(angleDiff(s.course.course!, 90)).toBeLessThan(5)
  })

  it('a buena velocidad recalcula antes por distancia recorrida fuera de la ruta', () => {
    const fixes = [gps(0, 0, 0, { speed: 25 }), ...Array.from({ length: 4 }, (_, i) => gps(25 * (i + 1), 200, (i + 1) * 1000, { speed: 25 }))]
    const { events } = track(fixes)
    expect(events.indexOf('reroute')).toBeGreaterThan(0)
    expect(events.indexOf('reroute')).toBeLessThan(1 + REROUTE_AFTER_MS / 1000)
  })

  it('sentido contrario sobre la calle de la ruta: se detecta como desvío y recalcula', () => {
    // Empieza en el km 0,5 y avanza hacia el OESTE por la misma calle.
    const fixes = Array.from({ length: 12 }, (_, i) => gps(556 - i * 14, 0, i * 1000))
    const { events, s } = track(fixes)
    expect(events).toContain('off-route')
    expect(events).toContain('reroute')
    expect(s.wrongWay).toBe(true)
    expect(angleDiff(s.course.course!, 270)).toBeLessThan(5)
  })

  it('al volver a la ruta en el sentido correcto, deja de estar desviado', () => {
    const off = Array.from({ length: 3 }, (_, i) => gps(i * 14, 150, i * 1000))
    const back = Array.from({ length: 3 }, (_, i) => gps(42 + i * 14, 0, 3000 + i * 1000))
    const { events, s } = track([...off, ...back])
    expect(events).toContain('back-on-route')
    expect(s.status).toBe('tracking')
  })

  it('pérdida temporal de la señal: estima el avance con la última velocidad, con límite', () => {
    const { s } = track(Array.from({ length: 5 }, (_, i) => gps(i * 14, 0, i * 1000, { speed: 14 })))
    const last = s.lastFix!.timestamp
    expect(deadReckonProgress(s, last + 2000, route.distance)).toBeNull()
    const after10 = deadReckonProgress(s, last + 10_000, route.distance)!
    expect(after10 - s.progress).toBeCloseTo(140, 0)
    // Nunca más allá de 30 s ni de la llegada.
    const after60 = deadReckonProgress(s, last + 60_000, route.distance)!
    expect(after60).toBeLessThan(route.distance)
    expect(after60 - s.progress).toBeLessThanOrEqual(14 * 30 + 1)
    expect(SIGNAL_LOST_MS).toBeGreaterThan(2000)
  })

  it('parado: no estima avance sin señal', () => {
    const { s } = track([gps(0, 0, 0, { speed: 0 }), gps(0, 0, 1000, { speed: 0 })])
    expect(deadReckonProgress(s, 20_000, route.distance)).toBeNull()
  })
})
