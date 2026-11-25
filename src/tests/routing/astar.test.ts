import { describe, expect, it } from 'vitest'
import { findRoute, MinHeap } from '@/features/routing/astar'
import { createGraph } from '@/features/routing/graph'
import { haversine, polylineLength } from '@/utils/distance'
import { node, road, sampleGraph } from './fixtures'

describe('findRoute (A*)', () => {
  it('1. ruta directa entre dos nodos conectados', () => {
    const g = sampleGraph()
    const r = findRoute(g, 'A', 'B')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.nodes).toEqual(['A', 'B'])
    expect(r.edges.map((e) => e.id)).toEqual(['AB:f'])
  })

  it('2. ruta con varios segmentos', () => {
    const g = sampleGraph()
    const r = findRoute(g, 'A', 'E')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.nodes).toEqual(['A', 'B', 'C', 'E'])
    expect(r.edges).toHaveLength(3)
  })

  it('3. elige la ruta óptima frente a una alternativa más larga', () => {
    const g = sampleGraph()
    // A→D→E tiene menos distancia geométrica que A→B→C→E, pero D–E es lenta (20 km/h).
    const fastest = findRoute(g, 'A', 'E', { cost: 'fastest' })
    const shortest = findRoute(g, 'A', 'E', { cost: 'shortest' })
    expect(fastest.ok && shortest.ok).toBe(true)
    if (!fastest.ok || !shortest.ok) return
    expect(shortest.nodes).toEqual(['A', 'D', 'E'])
    expect(fastest.nodes).toEqual(['A', 'B', 'C', 'E'])
    expect(shortest.distance).toBeLessThan(fastest.distance)
    expect(fastest.duration).toBeLessThan(shortest.duration)
  })

  it('4. respeta las carreteras de sentido único', () => {
    const g = createGraph()
    node(g, 'A', 0, 0)
    node(g, 'B', 0, 0.01)
    node(g, 'C', 0.01, 0.005)
    road(g, 'AB', 'A', 'B', { oneWay: true })
    road(g, 'BC', 'B', 'C')
    road(g, 'CA', 'C', 'A')
    const forward = findRoute(g, 'A', 'B')
    const backward = findRoute(g, 'B', 'A')
    expect(forward.ok && forward.nodes).toEqual(['A', 'B'])
    // B→A no puede usar AB en contra: debe rodear por C.
    expect(backward.ok && backward.nodes).toEqual(['B', 'C', 'A'])
  })

  it('5. detecta destinos no alcanzables', () => {
    const g = createGraph()
    node(g, 'A', 0, 0)
    node(g, 'B', 0, 0.01)
    node(g, 'Z', 1, 1)
    road(g, 'AB', 'A', 'B')
    const r = findRoute(g, 'A', 'Z')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unreachable')
  })

  it('5b. un sentido único sin retorno deja el origen inaccesible', () => {
    const g = createGraph()
    node(g, 'A', 0, 0)
    node(g, 'B', 0, 0.01)
    road(g, 'AB', 'A', 'B', { oneWay: true })
    const r = findRoute(g, 'B', 'A')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('unreachable')
  })

  it('6. nodo inexistente', () => {
    const r = findRoute(sampleGraph(), 'A', 'NOPE')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('node-not-found')
  })

  it('7. grafo vacío', () => {
    const r = findRoute(createGraph(), 'A', 'B')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('empty-graph')
  })

  it('8. con varios caminos posibles devuelve el de menor coste', () => {
    const g = createGraph()
    // Rombo con tres caminos de S a T; el central es el más corto.
    node(g, 'S', 0, 0)
    node(g, 'T', 0, 0.04)
    node(g, 'N', 0.01, 0.02)
    node(g, 'M', 0.001, 0.02)
    node(g, 'Sx', -0.012, 0.02)
    road(g, 'SN', 'S', 'N')
    road(g, 'NT', 'N', 'T')
    road(g, 'SM', 'S', 'M')
    road(g, 'MT', 'M', 'T')
    road(g, 'SSx', 'S', 'Sx')
    road(g, 'SxT', 'Sx', 'T')
    const r = findRoute(g, 'S', 'T', { cost: 'shortest' })
    expect(r.ok && r.nodes).toEqual(['S', 'M', 'T'])
    // Comprobación exhaustiva: ningún otro camino es más corto.
    const alternatives = [
      ['SN', 'NT'],
      ['SSx', 'SxT'],
    ].map((ids) => ids.reduce((acc, id) => acc + g.edges.get(`${id}:f`)!.distance, 0))
    if (r.ok) alternatives.forEach((d) => expect(r.distance).toBeLessThanOrEqual(d))
  })

  it('9. la geometría sigue las curvas de las vías (sin líneas rectas artificiales)', () => {
    const g = createGraph()
    node(g, 'A', 0, 0)
    node(g, 'B', 0, 0.02)
    road(g, 'AB', 'A', 'B', { via: [[0.005, 0.005], [0.005, 0.015]] })
    const r = findRoute(g, 'A', 'B')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.geometry).toEqual([
      [0, 0],
      [0.005, 0.005],
      [0.005, 0.015],
      [0, 0.02],
    ])
    expect(r.distance).toBeGreaterThan(haversine(0, 0, 0, 0.02))
  })

  it('10. distancia total coherente con la geometría', () => {
    const g = sampleGraph()
    const r = findRoute(g, 'A', 'E')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distance).toBeCloseTo(polylineLength(r.geometry), 3)
    expect(r.distance).toBeCloseTo(r.edges.reduce((a, e) => a + e.distance, 0), 6)
  })

  it('11. tiempo estimado = Σ distancia / velocidad', () => {
    const g = sampleGraph()
    const r = findRoute(g, 'A', 'E', { cost: 'shortest' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const expected = r.edges.reduce((acc, e) => acc + e.distance / (e.speedLimit / 3.6), 0)
    expect(r.duration).toBeCloseTo(expected, 6)
    // AD a 50 km/h y DE a 20 km/h
    const ad = g.edges.get('AD:f')!.distance
    const de = g.edges.get('DE:f')!.distance
    expect(r.duration).toBeCloseTo(ad / (50 / 3.6) + de / (20 / 3.6), 6)
  })

  it('12. reconstrucción: nodos y aristas encadenados en orden', () => {
    const g = sampleGraph()
    const r = findRoute(g, 'E', 'A')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.nodes[0]).toBe('E')
    expect(r.nodes[r.nodes.length - 1]).toBe('A')
    r.edges.forEach((e, i) => {
      expect(e.from).toBe(r.nodes[i])
      expect(e.to).toBe(r.nodes[i + 1])
    })
  })

  it('origen = destino devuelve ruta vacía de coste 0', () => {
    const r = findRoute(sampleGraph(), 'C', 'C')
    expect(r.ok && r.distance).toBe(0)
  })

  it('termina sin bucles infinitos en grafos con ciclos', () => {
    const g = createGraph()
    for (let i = 0; i < 30; i++) node(g, `n${i}`, 0, i * 0.001)
    for (let i = 0; i < 29; i++) road(g, `r${i}`, `n${i}`, `n${i + 1}`)
    road(g, 'loop', 'n29', 'n0')
    node(g, 'island', 5, 5)
    const r = findRoute(g, 'n0', 'island')
    expect(r.ok).toBe(false)
    expect(r.expanded).toBeLessThanOrEqual(30)
  })

  it('evita autopistas si se solicita', () => {
    const g = createGraph()
    node(g, 'A', 0, 0)
    node(g, 'B', 0, 0.05)
    node(g, 'C', 0.01, 0.025)
    road(g, 'hw', 'A', 'B', { type: 'motorway', speed: 120 })
    road(g, 'AC', 'A', 'C')
    road(g, 'CB', 'C', 'B')
    expect(findRoute(g, 'A', 'B').ok && findRoute(g, 'A', 'B')).toMatchObject({ nodes: ['A', 'B'] })
    const r = findRoute(g, 'A', 'B', { avoidHighways: true })
    expect(r.ok && r.nodes).toEqual(['A', 'C', 'B'])
  })
})

describe('MinHeap', () => {
  it('extrae en orden de prioridad', () => {
    const h = new MinHeap<number>()
    ;[5, 1, 9, 3, 7, 2].forEach((n) => h.push(n, n))
    const out: number[] = []
    while (h.size) out.push(h.pop()!)
    expect(out).toEqual([1, 2, 3, 5, 7, 9])
  })
})
