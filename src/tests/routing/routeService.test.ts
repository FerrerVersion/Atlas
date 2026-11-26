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
let running = 0
let maxConcurrent = 0
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async (plan: NetworkQueryPlan) => {
    calls.push(plan)
    running++
    maxConcurrent = Math.max(maxConcurrent, running)
    await new Promise((r) => setTimeout(r, 5))
    running--
    if (plan.corridor) return plan.corridor.level === 'secondary' ? [SECONDARY] : []
    if (plan.access) return []
    const [b] = plan.detail
    return b.south < 39.45 ? [LOCAL_B] : [LOCAL_A]
  }),
}))

const { computeMultiRoute } = await import('@/features/routing/routeService')
const { networkStore } = await import('@/features/osm/networkStore')

afterEach(() => {
  calls.length = 0
  maxConcurrent = 0
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
    const kinds = calls.map((c) => c.corridor?.level ?? (c.access ? 'acceso' : 'detalle'))
    // El corredor (lo más pesado) va primero; la ampliación, al final.
    expect(kinds[0]).toBe('primary')
    expect(kinds.at(-1)).toBe('secondary')
    expect([...kinds.slice(1, -1)].sort()).toEqual(['acceso', 'acceso', 'detalle', 'detalle'])
    expect(maxConcurrent).toBeLessThanOrEqual(2)
    expect(maxConcurrent).toBe(2)
    expect(route.distance).toBeGreaterThan(30_000)
    expect(status).toContain('Ampliando la red de carreteras para conectar las paradas…')
  })
})

describe('consulta Overpass de la red', () => {
  it('incluye los anillos de acceso con carreteras secundarias y terciarias', async () => {
    const { buildRoadQuery } = await vi.importActual<typeof import('@/features/osm/overpassService')>('@/features/osm/overpassService')
    const ql = buildRoadQuery({ detail: [], access: [{ south: 39.37, west: -0.85, north: 39.46, east: -0.73 }] })
    expect(ql).toContain('way["highway"~"^(secondary|secondary_link|tertiary|tertiary_link|unclassified)$"](39.37000,-0.85000,39.46000,-0.73000);')
  })
})
