import { describe, expect, it } from 'vitest'
import { findRoute } from '@/features/routing/astar'
import { nearestEdge } from '@/features/routing/edgeSnap'
import { createGraph } from '@/features/routing/graph'
import { routeOnGraph } from '@/features/routing/routeService'
import { navigationState, streetAt, voicePrompt } from '@/features/navigation/navigationProgress'
import { bearing } from '@/utils/distance'
import { startBearing } from '@/utils/geometry'
import { node, road } from './fixtures'

/**
 * Recálculo según el sentido de la marcha (grafos sintéticos; 0,001° ≈ 111 m).
 *
 *   a ─────────── b
 *   │             │
 *   c ─────────── d
 */
function block() {
  const g = createGraph()
  node(g, 'a', 0, 0)
  node(g, 'b', 0, 0.003)
  node(g, 'c', -0.001, 0)
  node(g, 'd', -0.001, 0.003)
  road(g, 'ab', 'a', 'b', { name: 'Calle Norte' })
  road(g, 'cd', 'c', 'd', { name: 'Calle Sur' })
  road(g, 'ac', 'a', 'c', { name: 'Calle Oeste' })
  road(g, 'bd', 'b', 'd', { name: 'Calle Este' })
  return g
}
const prefs = { cost: 'fastest' as const, avoidHighways: false }
const firstBearing = (r: ReturnType<typeof routeOnGraph>) => startBearing(r.legs[0].result.edges[0].geometry)

describe('recálculo con el rumbo del usuario', () => {
  // En mitad de la Calle Norte, circulando hacia el ESTE; el destino queda detrás (oeste).
  const origin = { lat: 0, lng: 0.0015 }
  const dest = { lat: 0, lng: 0.0002 }

  it('sin rumbo (ruta normal) va directa, aunque sea dando la vuelta', () => {
    const r = routeOnGraph(block(), [origin, dest], prefs)
    expect(Math.abs(firstBearing(r) - 270)).toBeLessThan(5)
  })

  it('con rumbo: sigue hacia delante y da la vuelta a la manzana en lugar de dar media vuelta', () => {
    const r = routeOnGraph(block(), [{ ...origin, heading: 90 }, dest], prefs)
    expect(Math.abs(firstBearing(r) - 90)).toBeLessThan(5)
    expect(r.instructions[0].type).toBe('depart')
    expect(r.instructions[0].text).toMatch(/^Continúa por Calle Norte/)
    // Da la vuelta a la manzana (este → sur → oeste), sin volver por la Calle Norte.
    const names = r.legs[0].result.edges.map((e) => e.name)
    expect(names).toContain('Calle Este')
    expect(names).toContain('Calle Sur')
    expect(names.filter((n) => n === 'Calle Norte').length).toBeLessThanOrEqual(2)
    for (const e of r.legs[0].result.edges) if (e.name === 'Calle Norte') expect(Math.abs(startBearing(e.geometry) - 270) > 5 || e.distance < 30).toBe(true)
  })

  it('si no hay alternativa razonable, calcula la maniobra correcta: dar la vuelta', () => {
    // Carretera de 3,3 km sin cruces: seguir hasta el final y volver sería absurdo.
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.03)
    road(g, 'ab', 'a', 'b', { name: 'Calle Cerrada' })
    const r = routeOnGraph(g, [{ ...origin, heading: 90 }, dest], prefs)
    expect(r.instructions[0].type).toBe('uturn')
    expect(r.instructions[0].text).toMatch(/^Da la vuelta cuando sea posible/)
    expect(Math.abs(firstBearing(r) - 270)).toBeLessThan(5)
  })

  it('a pie se da la vuelta sin penalización', () => {
    const r = routeOnGraph(block(), [{ ...origin, heading: 90 }, dest], { ...prefs, profile: 'walk' })
    expect(Math.abs(firstBearing(r) - 270)).toBeLessThan(5)
  })

  it('respeta los sentidos únicos aunque el rumbo diga otra cosa', () => {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.003)
    node(g, 'c', -0.001, 0)
    node(g, 'd', -0.001, 0.003)
    road(g, 'ab', 'a', 'b', { name: 'Calle Norte', oneWay: true }) // solo hacia el este
    road(g, 'cd', 'c', 'd', { name: 'Calle Sur' })
    road(g, 'ac', 'a', 'c', { name: 'Calle Oeste' })
    road(g, 'bd', 'b', 'd', { name: 'Calle Este' })
    // Aunque el GPS diga oeste (p. ej. va mal), la ruta nunca circula al revés por el sentido único.
    const r = routeOnGraph(g, [{ ...origin, heading: 270 }, dest], prefs)
    for (const e of r.legs[0].result.edges) if (e.name === 'Calle Norte') expect(Math.abs(startBearing(e.geometry) - 90)).toBeLessThan(5)
  })

  it('en un cruce, el ajuste a la vía elige la calle por la que circulas, no la perpendicular', () => {
    const g = createGraph()
    node(g, 'w', 0, -0.002)
    node(g, 'x', 0, 0)
    node(g, 'e', 0, 0.002)
    node(g, 'n', 0.002, 0)
    road(g, 'wx', 'w', 'x', { name: 'Calle Oeste' })
    road(g, 'xe', 'x', 'e', { name: 'Calle Oeste' })
    road(g, 'xn', 'x', 'n', { name: 'Calle Norte' })
    // 9 m al norte y 4 m al este del cruce: la perpendicular está más cerca (4 m).
    const p = { lat: 9 / 111_320, lng: 4 / 111_320 }
    expect(nearestEdge(g, p.lat, p.lng)!.edge.name).toBe('Calle Norte')
    expect(nearestEdge(g, p.lat, p.lng, 90)!.edge.name).toBe('Calle Oeste')
  })

  it('sin rumbo, el A* da el mismo resultado que antes (la penalización solo actúa al salir)', () => {
    const g = block()
    const plain = findRoute(g, 'a', 'd')
    const withHeading = findRoute(g, 'a', 'd', { startBearing: 90, startReversePenalty: 60 })
    expect(plain.ok && withHeading.ok).toBe(true)
    if (!plain.ok || !withHeading.ok) return
    expect(withHeading.distance).toBeCloseTo(plain.distance, 6)
  })
})

describe('voz: avisos útiles y sin repetir', () => {
  // Calle recta de 2 km hacia el este y giro a la izquierda al final.
  function longRoute() {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'x', 0, 0.018)
    node(g, 'n', 0.003, 0.018)
    node(g, 'e', 0, 0.021)
    road(g, 'ax', 'a', 'x', { name: 'Avenida Larga' })
    road(g, 'xe', 'x', 'e', { name: 'Avenida Larga' })
    road(g, 'xn', 'x', 'n', { name: 'Calle Final' })
    return routeOnGraph(g, [{ lat: 0, lng: 0 }, { lat: 0.0028, lng: 0.018 }], prefs)
  }

  it('al empezar: «Continúa por… durante 2 km»; luego «En 300 m…» y «Gira…» una sola vez cada uno', () => {
    const route = longRoute()
    const spoken: string[] = []
    const keys = new Set<string>()
    for (let p = 0; p <= route.distance; p += 10) {
      const v = voicePrompt(route, navigationState(route, p), 14, 'r1')
      if (v && !keys.has(v.key)) {
        keys.add(v.key)
        spoken.push(v.text)
      }
    }
    expect(spoken[0]).toBe('Continúa por Avenida Larga durante 2 kilómetros')
    expect(spoken[1]).toMatch(/^En 350 metros, gira a la izquierda por Calle Final$/)
    expect(spoken[2]).toBe('Gira a la izquierda por Calle Final')
    expect(spoken.at(-1)).toBe('Has llegado a tu destino')
    // Nada se dice dos veces.
    expect(new Set(spoken).size).toBe(spoken.length)
  })

  it('la antelación depende de la velocidad', () => {
    const route = longRoute()
    const turnAt = route.instructions[1].offset
    const st = navigationState(route, turnAt - 700)
    expect(voicePrompt(route, st, 8, 'r')).toBeNull() // en ciudad, a 700 m aún es pronto
    expect(voicePrompt(route, st, 33, 'r')!.key).toMatch(/:prepare$/) // a 120 km/h ya toca
  })

  it('la calle actual sale de los tramos de la ruta', () => {
    const route = longRoute()
    expect(streetAt(route, 100)).toBe('Avenida Larga')
    expect(streetAt(route, route.distance - 5)).toBe('Calle Final')
  })
})

it('rumbo de referencia del bloque de prueba', () => {
  expect(Math.round(bearing(0, 0, 0, 0.003))).toBe(90)
})
