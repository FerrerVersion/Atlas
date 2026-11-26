import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NetworkQueryPlan } from '@/features/osm/overpassService'
import type { OsmWay } from '@/features/routing/graph'

const way = (id: number, nodes: number[], coords: [number, number][], highway: string): OsmWay => ({
  type: 'way',
  id,
  nodes,
  geometry: coords.map(([lat, lon]) => ({ lat, lon })),
  tags: { highway, name: `Vía de prueba ${id}` },
})

// Dos zonas locales separadas ~40 km, unidas solo por una carretera secundaria.
const LOCAL_A = way(1, [1, 2], [[39.47, -0.38], [39.47, -0.37]], 'residential')
const LOCAL_B = way(2, [3, 4], [[39.42, -0.80], [39.42, -0.79]], 'residential')
const SECONDARY = way(3, [2, 3], [[39.47, -0.37], [39.42, -0.80]], 'secondary')

const calls: NetworkQueryPlan[] = []
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async (plan: NetworkQueryPlan) => {
    calls.push(plan)
    if (plan.corridor) return plan.corridor.level === 'secondary' ? [SECONDARY] : []
    const [b] = plan.detail
    return b.south < 39.45 ? [LOCAL_B] : [LOCAL_A]
  }),
}))

const { computeMultiRoute } = await import('@/features/routing/routeService')
const { networkStore } = await import('@/features/osm/networkStore')

afterEach(() => {
  calls.length = 0
  networkStore.clear()
})

describe('computeMultiRoute', () => {
  it('descarga por trozos y amplía el corredor si las vías principales no conectan', async () => {
    const status: string[] = []
    const route = await computeMultiRoute(
      [{ lat: 39.47, lng: -0.375 }, { lat: 39.42, lng: -0.795 }],
      { profile: 'car', cost: 'fastest', avoidHighways: false },
      { onStatus: (s) => status.push(s) },
    )
    expect(calls.map((c) => c.corridor?.level ?? 'detalle')).toEqual(['detalle', 'detalle', 'primary', 'secondary'])
    expect(route.distance).toBeGreaterThan(30_000)
    expect(status).toContain('Ampliando la red de carreteras para conectar las paradas…')
  })
})
