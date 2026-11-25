import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { findRoute } from '@/features/routing/astar'
import { buildGraphFromOsm, createGraph } from '@/features/routing/graph'
import { classifyTurn, generateInstructions } from '@/features/routing/routeInstructions'
import { routeOnGraph } from '@/features/routing/routeService'
import { node, road } from './fixtures'

/**
 * Cruce en T:     N
 *                 |
 *        W ————— X ————— E
 */
function crossGraph() {
  const g = createGraph()
  node(g, 'W', 0, -0.002)
  node(g, 'X', 0, 0)
  node(g, 'E', 0, 0.002)
  node(g, 'N', 0.002, 0)
  node(g, 'S', -0.002, 0)
  road(g, 'WX', 'W', 'X', { name: 'Calle Oeste' })
  road(g, 'XE', 'X', 'E', { name: 'Calle Oeste' })
  road(g, 'XN', 'X', 'N', { name: 'Calle Norte' })
  road(g, 'XS', 'X', 'S', { name: 'Calle Sur' })
  return g
}

describe('classifyTurn', () => {
  it('clasifica ángulos', () => {
    expect(classifyTurn(5)).toBe('continue')
    expect(classifyTurn(35)).toBe('slight-right')
    expect(classifyTurn(-90)).toBe('left')
    expect(classifyTurn(90)).toBe('right')
    expect(classifyTurn(150)).toBe('sharp-right')
    expect(classifyTurn(178)).toBe('uturn')
  })
})

describe('generateInstructions', () => {
  it('detecta giro a la izquierda y a la derecha según la geometría', () => {
    const g = crossGraph()
    const left = findRoute(g, 'W', 'N')
    const right = findRoute(g, 'W', 'S')
    if (!left.ok || !right.ok) throw new Error('ruta')
    const li = generateInstructions(g, left.edges)
    const ri = generateInstructions(g, right.edges)
    expect(li.map((i) => i.type)).toEqual(['depart', 'left', 'arrive'])
    expect(li[1].text).toBe('Gira a la izquierda por Calle Norte')
    expect(ri.map((i) => i.type)).toEqual(['depart', 'right', 'arrive'])
    expect(ri[2].text).toBe('Has llegado a tu destino')
  })

  it('continúa recto por la misma vía sin instrucción extra', () => {
    const g = crossGraph()
    const r = findRoute(g, 'W', 'E')
    if (!r.ok) throw new Error('ruta')
    const ins = generateInstructions(g, r.edges)
    expect(ins.map((i) => i.type)).toEqual(['depart', 'arrive'])
    expect(ins[0].text).toMatch(/^Dirígete hacia el este por Calle Oeste durante \d+ m$/)
    expect(ins[0].distance).toBeCloseTo(r.distance, 6)
  })

  it('anuncia incorporación y salida de autopista', () => {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.01)
    node(g, 'c', 0, 0.05)
    node(g, 'd', 0.002, 0.052)
    road(g, 'local', 'a', 'b', { name: 'Avenida', type: 'primary' })
    road(g, 'hw', 'b', 'c', { name: 'Autovía', type: 'motorway', oneWay: true, speed: 120 })
    road(g, 'exit', 'c', 'd', { name: 'Salida', type: 'motorway_link', oneWay: true })
    const r = findRoute(g, 'a', 'd')
    if (!r.ok) throw new Error('ruta')
    const types = generateInstructions(g, r.edges).map((i) => i.type)
    expect(types).toEqual(['depart', 'merge-highway', 'exit-highway', 'arrive'])
  })

  it('agrupa rotondas en «toma la N.ª salida»', () => {
    const g = createGraph()
    // Rotonda cuadrada r1→r2→r3→r4 (sentido único), entrada por r1 y salida por r3.
    node(g, 'in', 0, -0.003)
    node(g, 'r1', 0, -0.001)
    node(g, 'r2', 0.001, 0)
    node(g, 'r3', 0, 0.001)
    node(g, 'r4', -0.001, 0)
    node(g, 'out2', 0.003, 0)
    node(g, 'out3', 0, 0.003)
    road(g, 'IN', 'in', 'r1', { name: 'Entrada' })
    road(g, 'R12', 'r1', 'r2', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R23', 'r2', 'r3', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R34', 'r3', 'r4', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R41', 'r4', 'r1', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'O2', 'r2', 'out2', { name: 'Calle Norte' })
    road(g, 'O3', 'r3', 'out3', { name: 'Calle Este' })
    const r = findRoute(g, 'in', 'out3')
    if (!r.ok) throw new Error('ruta')
    const ins = generateInstructions(g, r.edges)
    const rb = ins.find((i) => i.type === 'roundabout')!
    expect(rb.roundaboutExit).toBe(2)
    expect(rb.text).toBe('En la rotonda, toma la 2.ª salida hacia Calle Este')
  })

  it('offsets crecientes y suma de distancias = total', () => {
    const g = buildGraphFromOsm(demoRoads)
    const route = routeOnGraph(
      g,
      [
        { lat: 39.4205, lng: -0.7905 },
        { lat: 39.4135, lng: -0.7945 },
      ],
      { cost: 'fastest', avoidHighways: false },
    )
    const ins = route.instructions
    for (let i = 1; i < ins.length; i++) expect(ins[i].offset).toBeGreaterThanOrEqual(ins[i - 1].offset)
    const sum = ins.reduce((a, i) => a + i.distance, 0)
    expect(sum).toBeCloseTo(route.distance, 3)
    expect(ins[ins.length - 1].type).toBe('arrive')
  })
})

describe('routeOnGraph (paradas múltiples)', () => {
  const g = buildGraphFromOsm(demoRoads)
  const A = { lat: 39.4205, lng: -0.7905 }
  const B = { lat: 39.4165, lng: -0.7985 }
  const C = { lat: 39.4135, lng: -0.7945 }

  it('pasa por todas las paradas en orden y suma los tramos', () => {
    const route = routeOnGraph(g, [A, B, C], { cost: 'fastest', avoidHighways: false })
    expect(route.legs).toHaveLength(2)
    expect(route.distance).toBeCloseTo(route.legs[0].result.distance + route.legs[1].result.distance, 6)
    const nodeB = route.snapped[1].nodeId
    expect(route.nodes).toContain(nodeB)
    expect(route.nodes.indexOf(nodeB)).toBeGreaterThan(0)
    // Sin nodos consecutivos duplicados
    for (let i = 1; i < route.nodes.length; i++) expect(route.nodes[i]).not.toBe(route.nodes[i - 1])
    expect(route.instructions.filter((i) => i.type === 'waypoint')).toHaveLength(1)
  })

  it('el orden de las paradas cambia la ruta', () => {
    const abc = routeOnGraph(g, [A, B, C], { cost: 'fastest', avoidHighways: false })
    const acb = routeOnGraph(g, [A, C, B], { cost: 'fastest', avoidHighways: false })
    expect(abc.snapped[2].nodeId).not.toBe(acb.snapped[2].nodeId)
  })

  it('rechaza paradas lejos de la red', () => {
    expect(() => routeOnGraph(g, [A, { lat: 40.4, lng: -3.7 }], { cost: 'fastest', avoidHighways: false })).toThrow(
      /destino está a más de/,
    )
  })
})
