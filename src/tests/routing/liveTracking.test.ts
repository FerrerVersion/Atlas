import { describe, expect, it } from 'vitest'
import {
  initialTracker,
  locateNear,
  remainingStopIndices,
  REROUTE_AFTER_MS,
  updateTracker,
  type GpsFix,
  type TrackerState,
} from '@/features/navigation/liveTracking'
import type { LatLngTuple } from '@/utils/distance'

// Ruta recta de ~1,1 km hacia el este (ecuador: 0,001° ≈ 111 m).
const geometry: LatLngTuple[] = Array.from({ length: 11 }, (_, i) => [0, i * 0.001])
const route = { geometry, distance: 1113.2 }
const fix = (lng: number, t: number, extra: Partial<GpsFix> = {}): GpsFix => ({
  lat: 0, lng, accuracy: 10, speed: null, timestamp: t, ...extra,
})

function run(fixes: GpsFix[], start: TrackerState = initialTracker()) {
  let s = start
  const events: string[] = []
  for (const f of fixes) {
    const r = updateTracker(s, f, route)
    s = r.state
    events.push(r.event)
  }
  return { s, events }
}

describe('seguimiento GPS en tiempo real', () => {
  it('avanza el progreso, suma lo recorrido y calcula la velocidad', () => {
    const { s } = run([fix(0, 0), fix(0.001, 10_000), fix(0.002, 20_000)])
    expect(s.status).toBe('tracking')
    expect(s.progress).toBeCloseTo(222.6, 0)
    expect(s.traveled).toBeCloseTo(222.6, 0)
    // 111 m en 10 s ≈ 40 km/h (suavizado)
    expect(s.speedKmh!).toBeGreaterThan(20)
    expect(s.speedKmh!).toBeLessThan(45)
  })

  it('usa la velocidad que da el dispositivo si existe', () => {
    const { s } = run([fix(0, 0, { speed: 13.9 })])
    expect(s.speedKmh).toBeCloseTo(50, 0)
  })

  it('ignora el temblor del GPS estando parado', () => {
    const { s } = run([fix(0.005, 0), fix(0.005 + 0.00002, 1000), fix(0.005 - 0.00002, 2000)])
    expect(s.traveled).toBe(0)
  })

  it('con señal débil no mueve el progreso', () => {
    const { s } = run([fix(0.002, 0), fix(0.006, 1000, { accuracy: 300 })])
    expect(s.status).toBe('weak-signal')
    expect(s.progress).toBeCloseTo(222.6, 0)
  })

  it('al desviarse avisa una vez y recalcula tras varias lecturas y unos segundos', () => {
    const off = (lng: number, t: number) => ({ ...fix(lng, t), lat: 0.002 }) // ~220 m al norte
    const { events, s } = run([fix(0.001, 0), off(0.001, 1000), off(0.0012, 2000), off(0.0014, 3000), off(0.0016, 1000 + REROUTE_AFTER_MS)])
    expect(events).toEqual(['none', 'off-route', 'none', 'none', 'reroute'])
    expect(s.lastRerouteAt).toBe(1000 + REROUTE_AFTER_MS)
  })

  it('no recalcula en bucle (espera entre recálculos)', () => {
    const off = (t: number) => ({ ...fix(0.001, t), lat: 0.002 })
    const { events } = run([off(0), off(1000), off(2000), off(7000), off(8000), off(9000), off(14_000)])
    expect(events.filter((e) => e === 'reroute')).toHaveLength(1)
  })

  it('vuelve a la ruta y lo indica', () => {
    const off = (t: number) => ({ ...fix(0.001, t), lat: 0.002 })
    const { events, s } = run([fix(0.001, 0), off(1000), fix(0.0015, 2000)])
    expect(events.at(-1)).toBe('back-on-route')
    expect(s.status).toBe('tracking')
  })

  it('detecta la llegada', () => {
    const { events, s } = run([fix(0.009, 0), fix(0.0099, 5000)])
    expect(events.at(-1)).toBe('arrived')
    expect(s.progress).toBe(route.distance)
  })

  it('la tolerancia crece con la imprecisión del GPS', () => {
    // 50 m fuera de la ruta: con precisión 10 m está fuera; con 60 m, dentro.
    const lat = 0.00045
    expect(updateTracker(initialTracker(), { ...fix(0.003, 0), lat }, route).state.status).toBe('off-route')
    expect(updateTracker(initialTracker(), { ...fix(0.003, 0), lat, accuracy: 60 }, route).state.status).toBe('tracking')
  })
})

describe('locateNear', () => {
  // Ida y vuelta por la misma calle: el punto (0, 0.002) aparece a 222 m y a ~1.780 m.
  const outAndBack: LatLngTuple[] = [...geometry, ...[...geometry].reverse().slice(1)]
  it('prefiere el tramo cercano al progreso actual', () => {
    expect(locateNear(outAndBack, [0, 0.002], 0, 40).offset).toBeCloseTo(222.6, 0)
    expect(locateNear(outAndBack, [0, 0.002], 1700, 40).offset).toBeGreaterThan(1700)
  })
})

describe('paradas pendientes al recalcular', () => {
  it('descarta las paradas ya pasadas', () => {
    // Tramos de 500, 300 y 400 m → paradas al final de cada uno (índices 1, 2, 3).
    expect(remainingStopIndices([500, 300, 400], 0)).toEqual([1, 2, 3])
    expect(remainingStopIndices([500, 300, 400], 600)).toEqual([2, 3])
    expect(remainingStopIndices([500, 300, 400], 1190)).toEqual([])
  })
})

describe('saltos del GPS', () => {
  it('un salto imposible no cuenta como recorrido ni dispara la velocidad', () => {
    // 3 lecturas normales a ~40 km/h y luego un salto de 550 m en 50 ms.
    const { s } = run([fix(0, 0), fix(0.001, 10_000), fix(0.006, 10_050)])
    expect(s.traveled).toBeCloseTo(111.3, 0)
    expect(s.speedKmh!).toBeLessThan(60)
  })
})
