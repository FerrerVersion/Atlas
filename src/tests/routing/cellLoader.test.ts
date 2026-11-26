import { afterEach, describe, expect, it, vi } from 'vitest'

let calls = 0
vi.mock('@/features/osm/overpassService', async (orig) => ({
  ...(await orig<typeof import('@/features/osm/overpassService')>()),
  fetchRoadNetwork: vi.fn(async () => {
    calls++
    await new Promise((r) => setTimeout(r, 10))
    return [{ type: 'way', id: calls, nodes: [1, 2], geometry: [{ lat: 39.42, lon: -0.79 }, { lat: 39.421, lon: -0.79 }], tags: { highway: 'residential' } }]
  }),
}))

const { ensureRoadCells } = await import('@/features/osm/cellLoader')
const { networkStore } = await import('@/features/osm/networkStore')
const { bboxAround } = await import('@/utils/geometry')

afterEach(() => {
  calls = 0
  networkStore.clear()
})

describe('rejilla de celdas compartida', () => {
  const zona = bboxAround(39.42, -0.79, 400)

  it('peticiones simultáneas de la misma zona (precarga + ruta + mapa) hacen una sola descarga', async () => {
    await Promise.all([ensureRoadCells(zona), ensureRoadCells(zona), ensureRoadCells(zona)])
    expect(calls).toBe(1)
  })

  it('una zona ya cargada no se vuelve a pedir y queda marcada como cubierta', async () => {
    await ensureRoadCells(zona)
    await ensureRoadCells(zona)
    expect(calls).toBe(1)
    expect(networkStore.covers(bboxAround(39.42, -0.79, 100))).toBe(true)
  })

  it('cancelar a un interesado no cancela la descarga para los demás', async () => {
    const ctrl = new AbortController()
    const a = ensureRoadCells(zona, { signal: ctrl.signal })
    const b = ensureRoadCells(zona)
    ctrl.abort()
    await expect(a).rejects.toThrow()
    await expect(b).resolves.toBeGreaterThanOrEqual(0)
    expect(networkStore.size).toBe(1)
  })
})
