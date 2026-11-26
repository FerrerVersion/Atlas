import { describe, expect, it } from 'vitest'
import { buildCustomGraph, emptyCustomMap, exportCustomMap, importCustomMap } from '@/features/customMap/customMapService'
import { geoToPixel, manualTransform, pixelToGeo, solveCalibration } from '@/features/customMap/imageCalibration'
import { findRoute } from '@/features/routing/astar'
import { haversine } from '@/utils/distance'

/** Genera referencias a partir de una transformación conocida (2 m/px, rotada 30°). */
const truth = (() => {
  const t = manualTransform(2, 30)
  return { ...t, originLat: 39.47, originLng: -0.376 }
})()
const ref = (x: number, y: number, id: string) => ({ id, x, y, ...pixelToGeo(truth, x, y) })

describe('calibración de imagen', () => {
  it('con 2 puntos recupera escala y rotación', () => {
    const t = solveCalibration([ref(0, 0, 'a'), ref(1000, 400, 'b')])!
    expect(t.metersPerPixel).toBeCloseTo(2, 3)
    expect(t.rotationDeg).toBeCloseTo(30, 2)
    const p = pixelToGeo(t, 500, 700)
    const q = pixelToGeo(truth, 500, 700)
    expect(haversine(p.lat, p.lng, q.lat, q.lng)).toBeLessThan(0.5)
  })

  it('con 3+ puntos ajusta por mínimos cuadrados con error ~0', () => {
    const t = solveCalibration([ref(0, 0, 'a'), ref(1000, 0, 'b'), ref(0, 800, 'c'), ref(900, 700, 'd')])!
    expect(t.rmse).toBeLessThan(0.5)
    expect(t.metersPerPixel).toBeCloseTo(2, 2)
  })

  it('geoToPixel es la inversa de pixelToGeo', () => {
    const t = solveCalibration([ref(10, 20, 'a'), ref(800, 600, 'b')])!
    const g = pixelToGeo(t, 321, 654)
    const px = geoToPixel(t, g.lat, g.lng)
    expect(px.x).toBeCloseTo(321, 3)
    expect(px.y).toBeCloseTo(654, 3)
  })

  it('rechaza referencias degeneradas', () => {
    expect(solveCalibration([ref(5, 5, 'a')])).toBeNull()
    expect(solveCalibration([ref(5, 5, 'a'), { ...ref(5, 5, 'b') }])).toBeNull()
  })
})

describe('mapa personalizado', () => {
  const map = {
    ...emptyCustomMap(),
    manualScale: 1,
    nodes: [
      { id: 'n1', name: 'Puerta Norte', x: 0, y: 0 },
      { id: 'n2', name: 'Plaza', x: 100, y: 0 },
      { id: 'n3', name: 'Faro', x: 100, y: 100 },
    ],
    roads: [
      { id: 'r1', from: 'n1', to: 'n2', name: 'Camino A', roadType: 'residential' as const, oneWay: false, speedLimit: 36 },
      { id: 'r2', from: 'n2', to: 'n3', name: 'Camino B', roadType: 'residential' as const, oneWay: true, speedLimit: 36 },
    ],
  }

  it('construye un grafo enrutable con la escala indicada', () => {
    const g = buildCustomGraph(map)
    const r = findRoute(g, 'n1', 'n3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distance).toBeCloseTo(200, 0)
    expect(r.duration).toBeCloseTo(20, 0)
    expect(findRoute(g, 'n3', 'n1').ok).toBe(false) // Camino B es de sentido único
  })

  it('exporta e importa JSON', () => {
    const json = JSON.parse(JSON.stringify(exportCustomMap(map, false)))
    expect(json.format).toBe('atlas-custom-map')
    const back = importCustomMap(json)
    expect(back.nodes).toEqual(map.nodes)
    expect(back.roads).toEqual(map.roads)
    expect(() => importCustomMap({ foo: 1 })).toThrow()
  })
})

describe('importación robusta', () => {
  it('rechaza mapas con vías a nodos inexistentes o coordenadas no numéricas', () => {
    const base = { format: 'atlas-custom-map', name: 'x', nodes: [{ id: 'a', name: 'A', x: 0, y: 0 }], roads: [] }
    expect(() => importCustomMap({ ...base, roads: [{ id: 'r', from: 'a', to: 'zz', speedLimit: 50 }] })).toThrow(/dañado/)
    expect(() => importCustomMap({ ...base, nodes: [{ id: 'a', x: 'uno', y: 0 }] })).toThrow(/dañado/)
    expect(importCustomMap(base).nodes).toHaveLength(1)
  })
})
