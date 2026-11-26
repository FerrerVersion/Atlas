import { describe, expect, it } from 'vitest'
import { findRoute } from '@/features/routing/astar'
import { nearestEdge } from '@/features/routing/edgeSnap'
import { buildGraphFromOsm } from '@/features/routing/graph'
import { routeOnGraph } from '@/features/routing/routeService'
import { NetworkStore } from '@/features/osm/networkStore'
import { syntheticCity } from './syntheticCity'

/**
 * Benchmarks con un grafo grande (npm run bench). No forman parte de `npm test`:
 * miden tiempos en esta máquina y los imprimen; solo comprueban que el resultado es
 * correcto. Úsalos para comparar antes/después de un cambio de rendimiento.
 */
const N = 150 // 150×150 cruces ≈ 44.700 vías (≈ una ciudad mediana cargada entera)

function time<T>(label: string, fn: () => T, runs = 5): { result: T; ms: number } {
  let result!: T
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t = performance.now()
    result = fn()
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  const ms = samples[Math.floor(samples.length / 2)]
  results.push({ prueba: label, 'mediana (ms)': +ms.toFixed(2), 'mejor (ms)': +samples[0].toFixed(2) })
  return { result, ms }
}
const results: Record<string, unknown>[] = []

describe(`rendimiento con una ciudad sintética de ${N}×${N} cruces`, () => {
  const ways = syntheticCity(N)
  const sw = { lat: 39.40 + 0.0004, lng: -0.45 + 0.0004 }
  const ne = { lat: 39.40 + (N - 1) * 0.001 - 0.0004, lng: -0.45 + (N - 1) * 0.001 - 0.0004 }

  it('mide construcción, ajuste, A*, ruta completa, actualización y consulta visible', () => {
    const { result: graph } = time('construir grafo (coche)', () => buildGraphFromOsm(ways, { profile: 'car' }), 3)
    time('ajustar una parada a la vía (1.ª vez, incluye preparar)', () => nearestEdge(graph, sw.lat, sw.lng), 1)
    time('ajustar una parada a la vía', () => nearestEdge(graph, ne.lat, ne.lng), 20)
    const a = nearestEdge(graph, sw.lat, sw.lng)!.edge.from
    const b = nearestEdge(graph, ne.lat, ne.lng)!.edge.to
    const { result: r } = time('A* esquina a esquina (más rápida)', () => findRoute(graph, a, b, { cost: 'fastest' }))
    expect(r.ok).toBe(true)
    time('A* esquina a esquina (más corta)', () => findRoute(graph, a, b, { cost: 'shortest' }))
    const { result: route } = time('ruta completa (ajuste + A* + indicaciones)', () =>
      routeOnGraph(graph, [sw, ne], { cost: 'fastest', avoidHighways: false }),
    )
    expect(route.distance).toBeGreaterThan(20_000)

    const store = new NetworkStore()
    store.addWays(ways.slice(0, ways.length - 100))
    store.graph('car')
    time('añadir 100 vías y obtener el grafo', () => {
      store.addWays(ways.slice(ways.length - 100))
      const g = store.graph('car')
      // Se deshace para repetir la medición en las mismas condiciones.
      return g
    }, 1)
    const view = { south: 39.46, north: 39.48, west: -0.40, east: -0.37 }
    time('vías dentro de la vista (zoom 15)', () => store.waysInBBox(view), 20)

    console.table(results)
    console.log(`grafo: ${graph.nodes.size} nodos, ${graph.edges.size} aristas · ruta: ${(route.distance / 1000).toFixed(1)} km, ${r.ok ? r.expanded : 0} nodos expandidos`)
  }, 120_000)
})
