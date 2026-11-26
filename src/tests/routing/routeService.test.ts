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
/** Escenario de fallos: 'ok' normal; 'access-fails' los anillos fallan al instante y el corredor tarda. */
let scenario: 'ok' | 'access-fails' | 'access-fails-no-link' = 'ok'
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async (plan: NetworkQueryPlan) => {
    calls.push(plan)
    running++
    maxConcurrent = Math.max(maxConcurrent, running)
    const { OverpassError } = await import('@/features/osm/overpassService')
    if (scenario !== 'ok' && plan.access) {
      running--
      throw new OverpassError('No se pudieron descargar datos de OpenStreetMap (504).')
    }
    await new Promise((r) => setTimeout(r, scenario === 'ok' ? 5 : 40))
    running--
    if (plan.corridor) {
      if (scenario === 'access-fails') return [SECONDARY]
      if (scenario === 'access-fails-no-link') return []
      return plan.corridor.level === 'secondary' ? [SECONDARY] : []
    }
    if (plan.access) return []
    // Devuelve las vías locales que caen dentro de la zona pedida.
    const [b] = plan.detail
    return [LOCAL_A, LOCAL_B].filter((w) =>
      w.geometry.some((p) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east),
    )
  }),
}))

const { computeMultiRoute } = await import('@/features/routing/routeService')
const { networkStore } = await import('@/features/osm/networkStore')

afterEach(() => {
  scenario = 'ok'
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
    // Todo en paralelo (el límite de 2 consultas reales lo pone el cliente de Overpass);
    // la ampliación del corredor, al final.
    expect(kinds.at(-1)).toBe('secondary')
    expect([...kinds.slice(0, -1)].sort()).toEqual(['acceso', 'acceso', 'detalle', 'detalle', 'primary'])
    expect(maxConcurrent).toBeGreaterThan(1)
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

describe('descargas que fallan', () => {
  it('si un trozo falla, espera a los demás y calcula la ruta con lo que llegó (avisando)', async () => {
    scenario = 'access-fails'
    const onIncomplete = vi.fn()
    // Antes, el primer fallo cortaba la espera y la ruta salía «inalcanzable» con el
    // corredor (que sí conecta las paradas) todavía descargándose.
    const route = await computeMultiRoute(
      [{ lat: 39.47, lng: -0.375 }, { lat: 39.42, lng: -0.795 }],
      { profile: 'car', cost: 'fastest', avoidHighways: false },
      { onIncomplete },
    )
    expect(route.distance).toBeGreaterThan(30_000)
    expect(onIncomplete).toHaveBeenCalledTimes(1)
  })

  it('si faltan datos por un fallo de descarga, informa del fallo y no de una red «inalcanzable»', async () => {
    scenario = 'access-fails-no-link'
    const { OverpassError } = await import('@/features/osm/overpassService')
    await expect(
      computeMultiRoute(
        [{ lat: 39.47, lng: -0.375 }, { lat: 39.42, lng: -0.795 }],
        { profile: 'car', cost: 'fastest', avoidHighways: false },
      ),
    ).rejects.toBeInstanceOf(OverpassError)
  })
})
