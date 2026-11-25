import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { findRoute } from '@/features/routing/astar'
import { buildGraphFromOsm, nearestNode, onewayDirection, parseMaxSpeed, type OsmWay } from '@/features/routing/graph'
import { polylineLength } from '@/utils/distance'

const way = (id: number, nodes: number[], coords: [number, number][], tags: Record<string, string>): OsmWay => ({
  type: 'way',
  id,
  nodes,
  geometry: coords.map(([lat, lon]) => ({ lat, lon })),
  tags,
})

describe('buildGraphFromOsm', () => {
  it('divide las vías en intersecciones y conserva nombres reales de OSM', () => {
    const ways = [
      way(1, [10, 11, 12], [[0, 0], [0, 0.001], [0, 0.002]], { highway: 'residential', name: 'Calle Uno' }),
      way(2, [20, 11, 21], [[0.001, 0.001], [0, 0.001], [-0.001, 0.001]], { highway: 'residential', name: 'Calle Dos' }),
    ]
    const g = buildGraphFromOsm(ways)
    expect(g.nodes.has('n11')).toBe(true)
    expect(g.nodes.get('n11')!.type).toBe('intersection')
    expect(g.nodes.get('n11')!.name).toBe('Calle Uno / Calle Dos')
    // 4 tramos de doble sentido = 8 aristas dirigidas
    expect(g.edges.size).toBe(8)
    const names = new Set([...g.edges.values()].map((e) => e.name))
    expect(names).toEqual(new Set(['Calle Uno', 'Calle Dos']))
  })

  it('aplica sentido único (oneway=yes, -1, rotondas, autopistas)', () => {
    expect(onewayDirection({ oneway: 'yes' }, 'car')).toBe(1)
    expect(onewayDirection({ oneway: '-1' }, 'car')).toBe(-1)
    expect(onewayDirection({ junction: 'roundabout' }, 'car')).toBe(1)
    expect(onewayDirection({ highway: 'motorway' }, 'car')).toBe(1)
    expect(onewayDirection({ highway: 'motorway', oneway: 'no' }, 'car')).toBe(0)
    expect(onewayDirection({ oneway: 'yes' }, 'walk')).toBe(0)

    const g = buildGraphFromOsm([way(1, [1, 2], [[0, 0], [0, 0.001]], { highway: 'residential', oneway: '-1' })])
    expect(g.edges.size).toBe(1)
    const e = [...g.edges.values()][0]
    expect(e.from).toBe('n2')
    expect(e.to).toBe('n1')
  })

  it('excluye vías peatonales para coche y autopistas a pie', () => {
    const ways = [
      way(1, [1, 2], [[0, 0], [0, 0.001]], { highway: 'footway' }),
      way(2, [3, 4], [[0, 0.01], [0, 0.011]], { highway: 'motorway' }),
    ]
    expect([...buildGraphFromOsm(ways, { profile: 'car' }).edges.values()].map((e) => e.roadType)).toEqual(['motorway'])
    expect([...buildGraphFromOsm(ways, { profile: 'walk' }).edges.values()].every((e) => e.roadType === 'footway')).toBe(true)
  })

  it('interpreta maxspeed', () => {
    expect(parseMaxSpeed('50')).toBe(50)
    expect(parseMaxSpeed('30 mph')).toBe(48)
    expect(parseMaxSpeed('ES:urban')).toBe(50)
    expect(parseMaxSpeed(undefined)).toBeNull()
  })

  it('la distancia de cada arista coincide con su geometría', () => {
    const g = buildGraphFromOsm(demoRoads)
    for (const e of g.edges.values()) expect(e.distance).toBeCloseTo(polylineLength(e.geometry), 6)
  })
})

describe('datos reales de Buñol (extracto OSM)', () => {
  const g = buildGraphFromOsm(demoRoads)

  it('genera un grafo conectado con calles reales', () => {
    expect(g.nodes.size).toBeGreaterThan(200)
    const names = new Set([...g.edges.values()].map((e) => e.name).filter(Boolean))
    expect(names.has('Avenida de Vicente Blasco Ibáñez')).toBe(true)
  })

  it('calcula una ruta real por la red', () => {
    const a = nearestNode(g, 39.4205, -0.7905)!
    const b = nearestNode(g, 39.4135, -0.7945)!
    expect(a.distance).toBeLessThan(200)
    const r = findRoute(g, a.node.id, b.node.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distance).toBeGreaterThan(500)
    expect(r.geometry.length).toBeGreaterThan(r.nodes.length - 1)
  })
})
