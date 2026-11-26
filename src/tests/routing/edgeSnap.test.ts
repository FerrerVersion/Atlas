import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { attachVirtualStop, nearestEdge } from '@/features/routing/edgeSnap'
import { buildGraphFromOsm, createGraph, type OsmWay } from '@/features/routing/graph'
import { routeOnGraph } from '@/features/routing/routeService'
import { haversine } from '@/utils/distance'
import { node, road } from './fixtures'

describe('salir del punto exacto de la calle', () => {
  // Calle larga A—B (2,2 km) con una sola intersección en cada extremo.
  const g = createGraph()
  node(g, 'A', 0, 0)
  node(g, 'B', 0, 0.02)
  node(g, 'C', 0.005, 0.02)
  road(g, 'AB', 'A', 'B')
  road(g, 'BC', 'B', 'C')

  it('la ruta empieza en el punto de la calle, no en el cruce más cercano', () => {
    // A 1,1 km de A y de B, sobre la calle (10 m al norte).
    const start = { lat: 0.00009, lng: 0.01 }
    const r = routeOnGraph(g, [start, { lat: 0.005, lng: 0.02 }], { cost: 'fastest', avoidHighways: false })
    expect(r.snapped[0].offsetMeters).toBeLessThan(15)
    const [lat, lng] = r.geometry[0]
    expect(haversine(lat, lng, 0, 0.01)).toBeLessThan(1)
    // 1,1 km hasta B + 0,55 km hasta C (no 2,2 km volviendo desde A).
    expect(r.distance).toBeCloseTo(1113 + 556, -1)
  })

  it('respeta el sentido único al salir de mitad de una calle', () => {
    const h = createGraph()
    node(h, 'A', 0, 0)
    node(h, 'B', 0, 0.02)
    node(h, 'D', 0.005, 0)
    road(h, 'AB', 'A', 'B', { oneWay: true }) // solo de A hacia B
    road(h, 'BD', 'B', 'D')
    road(h, 'AD', 'A', 'D')
    const r = routeOnGraph(h, [{ lat: 0, lng: 0.01 }, { lat: 0.005, lng: 0 }], { cost: 'shortest', avoidHighways: false })
    // No puede ir hacia A en contra: sigue hasta B y vuelve por D.
    expect(r.nodes).toContain('B')
  })

  it('deja el grafo como estaba (nodos temporales retirados)', () => {
    const before = { n: g.nodes.size, e: g.edges.size, out: [...g.outgoing.values()].flat().length }
    routeOnGraph(g, [{ lat: 0.0001, lng: 0.005 }, { lat: 0.004, lng: 0.02 }], { cost: 'fastest', avoidHighways: false })
    expect({ n: g.nodes.size, e: g.edges.size, out: [...g.outgoing.values()].flat().length }).toEqual(before)
  })

  it('sobre un extremo usa el nodo existente', () => {
    const snap = nearestEdge(g, 0, 0)!
    const v = attachVirtualStop(g, snap, 'x')
    expect(['A', 'B']).toContain(v.nodeId)
    v.remove()
  })
})

describe('caminos (highway=track)', () => {
  const way = (id: number, nodes: number[], coords: [number, number][], tags: Record<string, string>): OsmWay => ({
    type: 'way', id, nodes, geometry: coords.map(([lat, lon]) => ({ lat, lon })), tags,
  })

  it('se usan en coche si no están restringidos, con velocidad baja', () => {
    const g = buildGraphFromOsm([
      way(1, [1, 2], [[0, 0], [0, 0.001]], { highway: 'track', tracktype: 'grade2' }),
      way(2, [3, 4], [[0, 0.01], [0, 0.011]], { highway: 'track', access: 'agricultural' }),
      way(3, [5, 6], [[0, 0.02], [0, 0.021]], { highway: 'track', motor_vehicle: 'private' }),
      way(4, [7, 8], [[0, 0.03], [0, 0.031]], { highway: 'track', tracktype: 'grade5' }),
    ])
    const tracks = [...g.edges.values()]
    expect(new Set(tracks.map((e) => e.sourceId))).toEqual(new Set(['way/1']))
    expect(tracks[0].speedLimit).toBe(20)
  })

  it('los datos reales de Buñol tienen caminos utilizables en coche', () => {
    const g = buildGraphFromOsm(demoRoads)
    expect([...g.edges.values()].some((e) => e.roadType === 'track')).toBe(true)
  })
})
