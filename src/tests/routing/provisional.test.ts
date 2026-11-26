import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NetworkQueryPlan } from '@/features/osm/overpassService'
import type { OsmWay } from '@/features/routing/graph'

const way = (id: number, nodes: number[], coords: [number, number][], highway: string): OsmWay => ({
  type: 'way', id, nodes, geometry: coords.map(([lat, lon]) => ({ lat, lon })), tags: { highway, name: `Vía de prueba ${id}` },
})
const LOCAL_A = way(1, [1, 2], [[39.47, -0.38], [39.47, -0.37]], 'residential')
const LOCAL_B = way(2, [3, 4], [[39.42, -0.80], [39.42, -0.79]], 'residential')
const PRIMARY = way(3, [2, 3], [[39.47, -0.37], [39.42, -0.80]], 'primary')
const SHORTCUT = way(4, [2, 5, 3], [[39.47, -0.37], [39.45, -0.58], [39.42, -0.80]], 'secondary')

let t0 = 0
const log: string[] = []
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async (plan: NetworkQueryPlan) => {
    // El corredor llega rápido; los anillos de acceso tardan.
    await new Promise((r) => setTimeout(r, plan.access ? 300 : 20))
    log.push(`${Date.now() - t0}ms ${plan.corridor ? 'corredor' : plan.access ? 'anillo' : 'detalle'}`)
    if (plan.corridor) return [PRIMARY]
    if (plan.access) return [SHORTCUT]
    const [b] = plan.detail
    return [LOCAL_A, LOCAL_B].filter((w) => w.geometry.some((p) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east))
  }),
}))

const { computeMultiRoute } = await import('@/features/routing/routeService')
const { networkStore } = await import('@/features/osm/networkStore')
afterEach(() => {
  networkStore.clear()
  log.length = 0
})

describe('ruta provisional', () => {
  it('se entrega en cuanto los datos conectan las paradas, antes de terminar la descarga', async () => {
    t0 = Date.now()
    let provisionalAt = -1
    let provisionalKm = 0
    const final = await computeMultiRoute(
      [{ lat: 39.47, lng: -0.375 }, { lat: 39.42, lng: -0.795 }],
      { profile: 'car', cost: 'fastest', avoidHighways: false },
      {
        onProvisional: (r) => {
          provisionalAt = Date.now() - t0
          provisionalKm = r.distance
        },
      },
    )
    const finalAt = Date.now() - t0
    expect(provisionalAt).toBeGreaterThan(0)
    expect(provisionalAt).toBeLessThan(200) // no espera a los anillos (300 ms)
    expect(finalAt).toBeGreaterThanOrEqual(300)
    // Es una ruta real por calles; la final puede ser mejor con más datos.
    expect(provisionalKm).toBeGreaterThan(30_000)
    expect(final.distance).toBeGreaterThan(30_000)
  })
})
