import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { curveShape } from '@/features/navigation/curveShape'
import { initialTracker, type TrackerState } from '@/features/navigation/liveTracking'
import {
  classifyCurve,
  curveClass,
  geometryCurves,
  noteLabel,
  paceNotes,
  rallyState,
  roundAngle,
  shortLabel,
  straightLabel,
} from '@/features/navigation/pacenotes'
import { averageSpeed, currentSpeed, gpsQuality } from '@/features/navigation/telemetry'
import { buildGraphFromOsm, createGraph } from '@/features/routing/graph'
import { routeOnGraph } from '@/features/routing/routeService'
import type { LatLngTuple } from '@/utils/distance'
import { node, road } from './fixtures'

/**
 * Modo Rally: notas de copiloto a partir de la geometría (polilíneas sintéticas en el
 * ecuador, 1 m ≈ 1/111 320°) y de rutas reales de Buñol.
 */
const M = 1 / 111_320

/** Polilínea: recta de `lead` m, arco de `angle`° con radio `r` (vértices cada ~5 m) y recta de salida. */
function bend(start: [number, number], heading: number, parts: { straight?: number; angle?: number; r?: number }[]): LatLngTuple[] {
  let [x, y] = start // metros (x = este, y = norte)
  let h = heading // 0 = norte, 90 = este
  const pts: LatLngTuple[] = [[y * M, x * M]]
  const go = (len: number) => {
    x += len * Math.sin((h * Math.PI) / 180)
    y += len * Math.cos((h * Math.PI) / 180)
    pts.push([y * M, x * M])
  }
  for (const p of parts) {
    if (p.straight) go(p.straight)
    if (p.angle && p.r) {
      const arc = (Math.abs(p.angle) * Math.PI * p.r) / 180
      const n = Math.max(2, Math.ceil(arc / 5))
      for (let i = 0; i < n; i++) {
        h += p.angle / n
        go(arc / n)
      }
    }
  }
  return pts
}

describe('curvas de la geometría', () => {
  it('ruta recta: ninguna nota de curva', () => {
    expect(geometryCurves(bend([0, 0], 90, [{ straight: 2000 }]))).toEqual([])
  })

  it('curva real de 90° a la izquierda con radio 40 m: dirección, ángulo y clase', () => {
    const [c] = geometryCurves(bend([0, 0], 0, [{ straight: 200 }, { angle: -90, r: 40 }, { straight: 200 }]))
    expect(c.direction).toBe('left')
    expect(Math.abs(c.angle)).toBeGreaterThan(85)
    expect(Math.abs(c.angle)).toBeLessThan(95)
    expect(c.radius!).toBeGreaterThan(30)
    expect(c.radius!).toBeLessThan(55)
    expect(c.curve).toBe('medium')
    expect(c.approximate).toBe(false)
    expect(noteLabel(c)).toBe('IZQUIERDA 90°')
  })

  it('horquilla: 180° con radio pequeño', () => {
    const [c] = geometryCurves(bend([0, 0], 0, [{ straight: 200 }, { angle: 180, r: 15 }, { straight: 200 }]))
    expect(c.curve).toBe('hairpin')
    expect(noteLabel(c)).toBe('HORQUILLA DERECHA')
  })

  it('una curva larga y abierta de 160° NO es una horquilla', () => {
    const [c] = geometryCurves(bend([0, 0], 0, [{ straight: 100 }, { angle: 160, r: 120 }, { straight: 100 }]))
    expect(c.curve).not.toBe('hairpin')
    expect(c.curve).toBe('gentle')
  })

  it('curvas consecutivas (S): dos notas y la primera se encadena con la segunda', () => {
    const geometry = bend([0, 0], 0, [{ straight: 300 }, { angle: 60, r: 50 }, { straight: 15 }, { angle: -90, r: 35 }, { straight: 300 }])
    const curves = geometryCurves(geometry)
    expect(curves.map((c) => c.direction)).toEqual(['right', 'left'])
    const g = createGraph()
    const route = routeFromGeometry(g, geometry)
    const notes = paceNotes(route).filter((n) => n.kind === 'curve')
    expect(notes[0].into).toBe(true)
    expect(`${shortLabel(notes[0])} Y ${shortLabel(notes[1])}`).toBe('DER 60 Y IZQ 90')
  })

  it('carretera con muchas curvas suaves de menos de 20°: no se cantan', () => {
    const geometry = bend([0, 0], 0, [
      { straight: 200 },
      { angle: 12, r: 200 },
      { straight: 150 },
      { angle: -15, r: 200 },
      { straight: 150 },
      { angle: 10, r: 200 },
      { straight: 200 },
    ])
    expect(geometryCurves(geometry)).toEqual([])
  })

  it('clasificación por ángulo y por radio (la más suave de las dos)', () => {
    expect(classifyCurve(10)).toBeNull()
    expect(classifyCurve(-25)).toBe('very-gentle')
    expect(classifyCurve(100)).toBe('tight')
    expect(classifyCurve(170)).toBe('hairpin')
    expect(curveClass(30, 8, false)).toBe('very-gentle') // quiebro de 30°: no es un giro cerrado
    expect(curveClass(110, 200, false)).toBe('very-gentle') // 110° muy abiertos
    expect(curveClass(110, 30, true)).toBe('tight') // sin radio fiable: por el ángulo
  })

  it('ángulo redondeado sin precisión falsa', () => {
    expect(roundAngle(22)).toBe(20)
    expect(roundAngle(-47)).toBe(45)
    expect(roundAngle(98)).toBe(105)
    expect(straightLabel(320)).toBe('RECTA 300')
    expect(straightLabel(1260)).toBe('RECTA 1,3 KM')
  })
})

describe('estado del copiloto según el avance', () => {
  const geometry = bend([0, 0], 0, [{ straight: 400 }, { angle: -90, r: 30 }, { straight: 300 }, { angle: 90, r: 30 }, { straight: 300 }])
  const route = routeFromGeometry(createGraph(), geometry)
  const curves = paceNotes(route).filter((n) => n.kind === 'curve')

  it('curva actual, siguiente, distancia y barra de anticipación', () => {
    const s = rallyState(route, 100)
    expect(s.current).toBe(curves[0])
    expect(s.next).toBe(curves[1])
    expect(s.distance).toBeCloseTo(curves[0].start - 100, 0)
    expect(s.approach).toBeGreaterThan(0)
    expect(s.approach).toBeLessThan(1)
    const closer = rallyState(route, 300)
    expect(closer.approach).toBeGreaterThan(s.approach)
  })

  it('dentro de la curva sigue siendo la actual; al completarla pasa a la siguiente', () => {
    const mid = (curves[0].start + curves[0].end) / 2
    const inside = rallyState(route, mid)
    expect(inside.current).toBe(curves[0])
    expect(inside.inside).toBe(true)
    expect(inside.completion).toBeGreaterThan(0.3)
    expect(inside.completion).toBeLessThan(0.7)
    const after = rallyState(route, curves[0].end + 5)
    expect(after.current).toBe(curves[1])
    expect(after.inside).toBe(false)
    // La barra se reinicia con la nota nueva.
    expect(after.approach).toBeLessThan(0.2)
  })

  it('al final: la llegada, sin notas viejas', () => {
    const s = rallyState(route, route.distance - 10)
    expect(s.current?.kind).toBe('arrive')
    expect(s.next).toBeNull()
  })
})

describe('rutas reales (Buñol)', () => {
  const g = buildGraphFromOsm(demoRoads)
  const nodes = [...g.nodes.values()].filter((n) => n.type === 'intersection')

  it('las notas van en orden, con giros reales en cruces y sin duplicar la curva del cruce', () => {
    let seed = 3
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let checked = 0
    for (let k = 0; k < 80 && checked < 25; k++) {
      let r
      try {
        r = routeOnGraph(g, [nodes[Math.floor(rnd() * nodes.length)], nodes[Math.floor(rnd() * nodes.length)]], { cost: 'fastest', avoidHighways: false })
      } catch {
        continue
      }
      if (r.distance < 1000) continue
      checked++
      const notes = paceNotes(r)
      for (let i = 1; i < notes.length; i++) expect(notes[i].start).toBeGreaterThanOrEqual(notes[i - 1].start)
      expect(notes.at(-1)!.kind).toBe('arrive')
      // Cada giro de la ruta (instrucción) aparece como nota de cruce.
      const turns = r.instructions.filter((i) => ['left', 'right', 'sharp-left', 'sharp-right', 'slight-left', 'slight-right'].includes(i.type))
      for (const t of turns) expect(notes.some((n) => n.kind === 'junction' && Math.abs(n.start - t.offset) < 1)).toBe(true)
      // Ninguna curva de la geometría empieza a menos de 30 m de un cruce con giro (se absorbe).
      for (const n of notes.filter((x) => x.kind === 'junction')) {
        expect(notes.some((c) => c.kind === 'curve' && Math.abs(c.start - n.start) <= 30)).toBe(false)
      }
      for (const n of notes) if (n.kind === 'curve') expect(Math.abs(n.angle)).toBeGreaterThanOrEqual(20)
    }
    expect(checked).toBeGreaterThan(15)
  })

  it('ruta recalculada: notas nuevas (nada de la ruta anterior)', () => {
    const a = routeOnGraph(g, [nodes[10], nodes[200]], { cost: 'fastest', avoidHighways: false })
    const b = routeOnGraph(g, [nodes[50], nodes[200]], { cost: 'fastest', avoidHighways: false })
    expect(paceNotes(a)).toBe(paceNotes(a)) // memorizadas por ruta
    expect(paceNotes(b)).not.toBe(paceNotes(a))
    expect(rallyState(b, 0).current).toBe(paceNotes(b)[0])
  })
})

describe('velocidad del GPS (telemetry.ts)', () => {
  const at = (extra: Partial<TrackerState> & { accuracy?: number; age?: number } = {}): [TrackerState, number] => {
    const now = 100_000
    const s = { ...initialTracker(), speedKmh: 52.4, ...extra }
    s.lastFix = { lat: 0, lng: 0, accuracy: extra.accuracy ?? 8, speed: null, timestamp: now - (extra.age ?? 500) }
    return [s, now]
  }
  const sim = { active: false, kmh: 0 }

  it('sale del GPS, en km/h enteros', () => {
    expect(currentSpeed(...at(), sim)).toEqual({ kmh: 52, source: 'gps' })
  })
  it('usuario detenido: 0 (no el temblor del GPS)', () => {
    expect(currentSpeed(...at({ speedKmh: 1.7 }), sim).kmh).toBe(0)
  })
  it('señal débil o sin lecturas recientes: sin velocidad («—»), nunca inventada', () => {
    expect(currentSpeed(...at({ accuracy: 90 }), sim)).toEqual({ kmh: null, source: null, reason: 'weak-signal' })
    expect(currentSpeed(...at({ age: 9000 }), sim)).toEqual({ kmh: null, source: null, reason: 'no-signal' })
    expect(currentSpeed(initialTracker(), 1, sim).kmh).toBeNull()
  })
  it('valores absurdos o negativos: sin velocidad', () => {
    expect(currentSpeed(...at({ speedKmh: -4 }), sim).kmh).toBeNull()
    expect(currentSpeed(...at({ speedKmh: 900 }), sim).kmh).toBeNull()
  })
  it('en la simulación se dice que es simulada', () => {
    expect(currentSpeed(initialTracker(), 1, { active: true, kmh: 44.6 })).toEqual({ kmh: 45, source: 'simulation' })
  })
  it('media solo con datos suficientes; calidad de la señal', () => {
    const [s, now] = at()
    expect(averageSpeed({ ...s, startedAt: now - 30_000, traveled: 400 }, now)).toBeNull()
    expect(averageSpeed({ ...s, startedAt: now - 120_000, traveled: 2000 }, now)).toBe(60)
    expect(gpsQuality(s, now, false)).toBe('good')
    expect(gpsQuality(at({ accuracy: 30 })[0], now, false)).toBe('fair')
    expect(gpsQuality(at({ accuracy: 80 })[0], now, false)).toBe('weak')
    expect(gpsQuality(at({ age: 8000 })[0], now, false)).toBe('none')
  })
})

describe('forma de la curva', () => {
  it('cabe en la caja y gira hacia el lado correcto', () => {
    for (const angle of [-180, -90, -30, 30, 90, 180]) {
      const s = curveShape(angle, classifyCurve(angle))
      const nums = s.path.match(/-?\d+(\.\d+)?/g)!.map(Number)
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(100)
      }
      const [tipX] = s.head.split(' ')[0].split(',').map(Number)
      const [startX] = nums
      if (Math.abs(angle) < 170) expect(Math.sign(tipX - startX)).toBe(Math.sign(angle))
    }
  })
})

/** Ruta de un solo tramo que sigue exactamente la polilínea (vía sin cruces). */
function routeFromGeometry(g: ReturnType<typeof createGraph>, geometry: LatLngTuple[]) {
  const a = geometry[0]
  const b = geometry[geometry.length - 1]
  node(g, 'a', a[0], a[1])
  node(g, 'b', b[0], b[1])
  road(g, 'ab', 'a', 'b', { name: 'Carretera de prueba', via: geometry.slice(1, -1) })
  return routeOnGraph(g, [{ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }], { cost: 'fastest', avoidHighways: false })
}
