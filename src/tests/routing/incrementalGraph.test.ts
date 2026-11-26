import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { nearestEdge } from '@/features/routing/edgeSnap'
import { buildGraphFromOsm, GraphBuilder, type OsmWay } from '@/features/routing/graph'
import type { RoadGraph, TravelProfile } from '@/features/routing/routeTypes'
import { syntheticCity } from '@/bench/syntheticCity'

/** Huella completa del grafo: nodos (tipo y nombre) y aristas (extremos, distancia, tiempo, geometría). */
function fingerprint(g: RoadGraph) {
  const nodes = [...g.nodes.values()].map((n) => `${n.id}|${n.type}|${n.name ?? ''}|${n.lat}|${n.lng}`).sort()
  const edges = [...g.edges.values()]
    .map((e) => `${e.id}|${e.from}|${e.to}|${e.distance.toFixed(6)}|${(e.time ?? 0).toFixed(6)}|${e.geometry.length}`)
    .sort()
  const outgoing = [...g.outgoing.entries()].map(([k, v]) => `${k}:${[...v].sort().join(',')}`).sort()
  return { nodes, edges, outgoing }
}

/** Mezcla determinista (para repetir el test siempre igual). */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const real = (demoRoads as unknown as { elements: OsmWay[] }).elements ?? (demoRoads as unknown as OsmWay[])

describe('grafo incremental', () => {
  it.each<[string, OsmWay[], TravelProfile]>([
    ['extracto real de Buñol (coche)', real, 'car'],
    ['extracto real de Buñol (a pie)', real, 'walk'],
    ['ciudad sintética con sentidos únicos', syntheticCity(25), 'car'],
  ])('%s: añadir las vías por tandas y en cualquier orden da el mismo grafo que construirlo de cero', (_l, ways, profile) => {
    const full = fingerprint(buildGraphFromOsm(ways, { profile }))
    for (const seed of [1, 7, 42]) {
      const b = new GraphBuilder({ profile })
      const order = shuffled(ways, seed)
      for (let i = 0; i < order.length; i += 37) b.addWays(order.slice(i, i + 37))
      expect(fingerprint(b.graph)).toEqual(full)
    }
  })

  it('añadir vías repetidas no cambia nada y cada cambio aumenta la revisión', () => {
    const b = new GraphBuilder()
    b.addWays(real)
    const rev = b.graph.revision
    const before = fingerprint(b.graph)
    b.addWays(real)
    expect(b.graph.revision).toBe(rev)
    expect(fingerprint(b.graph)).toEqual(before)
  })

  it('el ajuste a la vía con índice espacial da el mismo resultado que recorrer todas las aristas', () => {
    const indexed = new GraphBuilder().addWays(syntheticCity(40)).graph
    const plain: RoadGraph = { ...indexed, index: undefined }
    for (let k = 0; k < 60; k++) {
      const lat = 39.40 + ((k * 7) % 40) * 0.001 + 0.0003
      const lng = -0.45 + ((k * 13) % 40) * 0.001 + 0.0006
      const a = nearestEdge(indexed, lat, lng)!
      const b = nearestEdge(plain, lat, lng)!
      expect(a.distance).toBeCloseTo(b.distance, 6)
    }
    // Lejos de todo (más allá de los anillos del índice): también acierta.
    expect(nearestEdge(indexed, 39.6, -0.2)!.distance).toBeCloseTo(nearestEdge(plain, 39.6, -0.2)!.distance, 6)
  })
})
