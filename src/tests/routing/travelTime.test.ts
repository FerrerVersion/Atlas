import { describe, expect, it } from 'vitest'
import { curveAwareTime, vertexSpeeds } from '@/features/routing/travelTime'
import { polylineLength, type LatLngTuple } from '@/utils/distance'

/** Arco circular de radio r (m) y ángulo total (grados), con vértices cada `step` grados. */
function arc(r: number, totalDeg: number, step = 5): LatLngTuple[] {
  const m = 111_320
  const pts: LatLngTuple[] = []
  for (let a = 0; a <= totalDeg; a += step) {
    const rad = (a * Math.PI) / 180
    pts.push([(r * Math.sin(rad)) / m, (r * (1 - Math.cos(rad))) / m])
  }
  return pts
}

describe('tiempo de recorrido con curvas', () => {
  it('en recta coincide con distancia / límite', () => {
    const recta: LatLngTuple[] = [[0, 0], [0, 0.005], [0, 0.01]]
    const len = polylineLength(recta)
    expect(curveAwareTime(recta, 90)).toBeCloseTo(len / 25, 3)
  })

  it('estima la velocidad de una curva por su radio: v = √(2,6 · R)', () => {
    const v = vertexSpeeds(arc(100, 90), 90)
    // R = 100 m → √260 ≈ 16,1 m/s ≈ 58 km/h
    const mid = v[Math.floor(v.length / 2)]
    expect(mid * 3.6).toBeGreaterThan(50)
    expect(mid * 3.6).toBeLessThan(65)
  })

  it('una curva cerrada tarda bastante más que a la velocidad del límite', () => {
    const curva = arc(30, 180) // horquilla de radio 30 m
    const len = polylineLength(curva)
    const ingenuo = len / 25 // a 90 km/h
    const real = curveAwareTime(curva, 90)
    expect(real).toBeGreaterThan(ingenuo * 2.5)
    // ~ 31 km/h en la horquilla
    expect((len / real) * 3.6).toBeGreaterThan(25)
    expect((len / real) * 3.6).toBeLessThan(38)
  })

  it('nunca supera el límite ni frena por el ruido de la geometría', () => {
    const casiRecta: LatLngTuple[] = [[0, 0], [0.00001, 0.003], [0, 0.006], [0.00001, 0.009]]
    const len = polylineLength(casiRecta)
    expect(curveAwareTime(casiRecta, 50)).toBeCloseTo(len / (50 / 3.6), 1)
  })

  it('en una esquina de 90° con tramos largos frena a ~35 km/h, no a paso de peatón', () => {
    const esquina: LatLngTuple[] = [[0, 0], [0, 0.002], [0.002, 0.002]]
    const v = vertexSpeeds(esquina, 50)[1] * 3.6
    expect(v).toBeGreaterThan(25)
    expect(v).toBeLessThan(40)
  })
})

describe('tiempo de las maniobras', async () => {
  const { applyManeuverTime } = await import('@/features/routing/routeService')
  it('cada giro suma sus segundos y retrasa las horas de paso siguientes', () => {
    const ins = [
      { type: 'depart', duration: 60, timeOffset: 0 },
      { type: 'left', duration: 30, timeOffset: 60 },
      { type: 'roundabout', duration: 40, timeOffset: 90 },
      { type: 'arrive', duration: 0, timeOffset: 130 },
    ] as Parameters<typeof applyManeuverTime>[0]
    const extra = applyManeuverTime(ins)
    expect(extra).toBe(7 + 8)
    expect(ins.map((i) => i.timeOffset)).toEqual([0, 60, 97, 145])
    // La llegada coincide con la suma de duraciones (coherencia para la navegación).
    expect(ins.reduce((a, i) => a + i.duration, 0)).toBe(ins[3].timeOffset)
  })
})

describe('aceleración y frenada entre curvas', () => {
  it('una recta corta entre dos horquillas no se recorre al límite', () => {
    // Horquilla, 150 m de recta, horquilla: a 1,2 m/s² no da tiempo a llegar a 90 km/h.
    const h1 = arc(25, 180)
    const last = h1[h1.length - 1]
    const recta: LatLngTuple[] = Array.from({ length: 6 }, (_, i) => [last[0] - (i + 1) * (30 / 111_320), last[1]])
    const g = [...h1, ...recta]
    const tramoRecta = polylineLength(recta)
    const tSoloRecta = curveAwareTime([h1[h1.length - 1], ...recta], 90)
    expect(tSoloRecta).toBeGreaterThan(tramoRecta / 25) // no a 25 m/s (90 km/h)
    expect(curveAwareTime(g, 90)).toBeGreaterThan(curveAwareTime(h1, 90))
  })
})
