import { describe, expect, it } from 'vitest'
import { emptyCustomMap, exportCustomMap, importCustomMap, MAX_NODES } from '@/features/customMap/customMapService'
import type { CustomMap } from '@/features/customMap/customMapTypes'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function sampleMap(): CustomMap {
  return {
    ...emptyCustomMap(),
    name: 'Isla de ejemplo (ficticia)',
    image: { dataUrl: PNG, width: 800, height: 600, fileName: 'isla.png' },
    references: [
      { id: 'r1', x: 0, y: 0, lat: 39.4, lng: -0.4 },
      { id: 'r2', x: 800, y: 600, lat: 39.39, lng: -0.39 },
    ],
    nodes: [
      { id: 'a', name: 'Muelle', x: 10, y: 10 },
      { id: 'b', name: '', x: 200, y: 50 },
    ],
    roads: [{ id: 'v1', from: 'a', to: 'b', name: 'Camino Real', roadType: 'residential', oneWay: false, speedLimit: 30 }],
  }
}

const exported = (map = sampleMap()) => JSON.parse(JSON.stringify(exportCustomMap(map, true)))

describe('importar mapas personalizados', () => {
  it('un mapa exportado por Atlas se importa igual (nodos, vías, referencias e imagen)', () => {
    const m = importCustomMap(exported())
    expect(m.name).toBe('Isla de ejemplo (ficticia)')
    expect(m.nodes).toEqual(sampleMap().nodes)
    expect(m.roads).toEqual(sampleMap().roads)
    expect(m.references).toEqual(sampleMap().references)
    expect(m.image?.dataUrl).toBe(PNG)
  })

  it.each([
    ['una URL externa', 'https://rastreador.example/pixel.png'],
    ['un protocolo javascript:', 'javascript:alert(1)'],
    ['un SVG (puede llevar código)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['texto que no es base64', 'data:image/png;base64,<script>'],
  ])('rechaza como imagen %s', (_label, dataUrl) => {
    const d = exported()
    d.image.dataUrl = dataUrl
    expect(() => importCustomMap(d)).toThrow(/solo se admiten imágenes PNG, JPG o WebP/)
  })

  it('rechaza imágenes con un tamaño imposible o desmesurado', () => {
    const d = exported()
    d.image.width = 100_000
    expect(() => importCustomMap(d)).toThrow(/tamaño válido/)
  })

  it('rechaza referencias con coordenadas imposibles', () => {
    const d = exported()
    d.calibration.references[0].lat = 123
    expect(() => importCustomMap(d)).toThrow(/coordenadas imposibles/)
  })

  it('rechaza mapas demasiado grandes', () => {
    const d = exported()
    d.nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) => ({ id: `n${i}`, name: '', x: i, y: i }))
    d.roads = []
    expect(() => importCustomMap(d)).toThrow(/demasiado grande/)
  })

  it('rechaza nodos duplicados y vías que se unen a sí mismas', () => {
    const dup = exported()
    dup.nodes.push({ ...dup.nodes[0] })
    expect(() => importCustomMap(dup)).toThrow(/dañado/)
    const loop = exported()
    loop.roads[0].to = loop.roads[0].from
    expect(() => importCustomMap(loop)).toThrow(/dañado/)
  })

  it('sanea los textos y los tipos que no son válidos sin romper la importación', () => {
    const d = exported()
    d.name = { nombre: 'objeto' }
    d.nodes[0].name = 42
    d.roads[0].roadType = 'autopista-voladora'
    d.roads[0].oneWay = 'sí'
    d.manualScale = -5
    const m = importCustomMap(d)
    expect(m.name).toBe('Mapa importado')
    expect(m.nodes[0].name).toBe('')
    expect(m.roads[0].roadType).toBe('custom')
    expect(m.roads[0].oneWay).toBe(false)
    expect(m.manualScale).toBe(1)
  })
})
