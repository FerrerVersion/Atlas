import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NetworkQueryPlan } from '@/features/osm/overpassService'
import type { OsmWay } from '@/features/routing/graph'
import { bboxDiagonal, bboxIntersects, bboxOf, type BBox } from '@/utils/geometry'

/**
 * Un camino peatonal real-ista de ~14 km de sur a norte (tramos de ~110 m), como una
 * ruta a pie larga dentro de una ciudad.
 */
const START = { lat: 39.40, lng: -0.38 }
const SEGMENTS = 130
const PATH: OsmWay[] = Array.from({ length: SEGMENTS }, (_, i) => ({
  type: 'way',
  id: 1000 + i,
  nodes: [i, i + 1],
  geometry: [
    { lat: START.lat + i * 0.001, lon: START.lng },
    { lat: START.lat + (i + 1) * 0.001, lon: START.lng },
  ],
  tags: { highway: 'footway', name: 'Paseo de prueba' },
}))
const END = { lat: START.lat + SEGMENTS * 0.001, lng: START.lng }

const requested: BBox[] = []
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async (plan: NetworkQueryPlan) => {
    const [b] = plan.detail
    requested.push(b)
    const bbox = (w: OsmWay) => bboxOf(w.geometry.map((p) => ({ lat: p.lat, lng: p.lon })))
    return PATH.filter((w) => bboxIntersects(bbox(w), b))
  }),
}))

const { computeMultiRoute, walkCorridor } = await import('@/features/routing/routeService')
const { networkStore } = await import('@/features/osm/networkStore')
const { cellsForAreas, ensureRoadCells, groupIntoBlocks } = await import('@/features/osm/cellLoader')

afterEach(() => {
  requested.length = 0
  networkStore.clear()
})

describe('rutas a pie largas', () => {
  it('descarga todo el corredor (sin recortar celdas) y encuentra la ruta de ~14 km', async () => {
    // Antes: el rectángulo se recortaba a 36 celdas empezando por el sur y el norte
    // del recorrido quedaba sin calles («inalcanzable»).
    const route = await computeMultiRoute([START, END], { profile: 'walk', cost: 'shortest', avoidHighways: false })
    expect(route.distance).toBeGreaterThan(14_000)
    expect(route.distance).toBeLessThan(14_600)
    // Varias consultas por bloques, ninguna mayor que 6×6 celdas (~10 km de lado).
    expect(requested.length).toBeGreaterThan(1)
    for (const b of requested) expect(bboxDiagonal(b)).toBeLessThan(15_000)
  })

  it('el corredor sigue los tramos y es mucho menor que el rectángulo entero', () => {
    const a = { lat: 39.40, lng: -0.45 }
    const b = { lat: 39.55, lng: -0.30 } // ~21 km en diagonal
    const corridor = cellsForAreas(walkCorridor([a, b])).length
    const rectangle = cellsForAreas([bboxOf([a, b])]).length
    expect(corridor).toBeLessThan(rectangle * 0.6)
  })
})

describe('descarga de celdas por bloques', () => {
  it('una zona pequeña, aunque cruce el borde de un bloque, es una sola consulta', () => {
    const cells = cellsForAreas([{ south: 39.465, north: 39.505, west: -0.405, east: -0.365 }])
    expect(cells.length).toBeLessThanOrEqual(16)
    expect(groupIntoBlocks(cells)).toHaveLength(1)
  })

  it('una zona grande se reparte en bloques de como mucho 6×6 celdas y se cargan todas', async () => {
    const area = { south: 39.40, north: 39.53, west: -0.40, east: -0.36 } // ~14 × 3,5 km
    const cells = cellsForAreas([area])
    await ensureRoadCells(area, { maxCells: Infinity })
    expect(cells.every((c) => networkStore.hasCell(c.key))).toBe(true)
    expect(requested.length).toBe(groupIntoBlocks(cells).length)
  })

  it('la carga automática del mapa sigue acotada y empieza por el centro', async () => {
    const area = { south: 39.40, north: 39.53, west: -0.40, east: -0.36 }
    await ensureRoadCells(area, { maxCells: 9 })
    const centerCell = cellsForAreas([{ south: 39.465, north: 39.4651, west: -0.38, east: -0.3799 }])[0]
    expect(networkStore.hasCell(centerCell.key)).toBe(true)
  })
})
