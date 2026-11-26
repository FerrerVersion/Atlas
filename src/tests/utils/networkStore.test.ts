import { describe, expect, it } from 'vitest'
import { cellsForBBox, NetworkStore } from '@/features/osm/networkStore'
import type { OsmWay } from '@/features/routing/graph'
import { bboxAround } from '@/utils/geometry'

let nextId = 1
/** Vía corta real-istica (dos puntos) en torno a un punto. */
const wayAt = (lat: number, lng: number): OsmWay => {
  const id = nextId++
  return { type: 'way', id, nodes: [id * 10, id * 10 + 1], geometry: [{ lat, lon: lng }, { lat: lat + 0.0005, lon: lng + 0.0005 }], tags: { highway: 'residential' } }
}

describe('red cargada con tope de memoria', () => {
  it('al pasar del tope libera lo más alejado y conserva la zona en uso', () => {
    const store = new NetworkStore()
    store.configure({ maxWays: 10, targetWays: 6 })
    const valencia = { lat: 39.47, lng: -0.376 }
    store.setKeepAreas([bboxAround(valencia.lat, valencia.lng, 2_000)])

    const near = Array.from({ length: 4 }, (_, i) => wayAt(valencia.lat + i * 0.001, valencia.lng))
    const mid = Array.from({ length: 4 }, (_, i) => wayAt(39.42 + i * 0.001, -0.79)) // Buñol, ~36 km
    const far = Array.from({ length: 4 }, (_, i) => wayAt(40.41 + i * 0.001, -3.70)) // Madrid
    const farCells = far.flatMap((w) => cellsForBBox({ south: w.geometry[0].lat, north: w.geometry[1].lat, west: w.geometry[0].lon, east: w.geometry[1].lon }).map((c) => c.key))
    store.markCells(farCells)
    store.addCoverage([bboxAround(40.41, -3.70, 500)])
    store.addWays([...near, ...mid, ...far])

    expect(store.size).toBe(6)
    // La zona en uso se conserva entera; lo más lejano (Madrid) se libera primero.
    for (const w of near) expect(store.hasWay(w.id)).toBe(true)
    for (const w of far) expect(store.hasWay(w.id)).toBe(false)
    // Lo liberado deja de contar como cargado: se volverá a pedir si hace falta.
    expect(farCells.some((k) => store.hasCell(k))).toBe(false)
    expect(store.covers(bboxAround(40.41, -3.70, 100))).toBe(false)
  })

  it('mientras se calcula una ruta, su zona fijada no se libera', () => {
    const store = new NetworkStore()
    store.configure({ maxWays: 4, targetWays: 2 })
    store.setKeepAreas([])
    const unpin = store.pin([bboxAround(40.41, -3.70, 3_000)])
    const madrid = Array.from({ length: 6 }, (_, i) => wayAt(40.41 + i * 0.001, -3.70))
    store.addWays(madrid)
    expect(store.size).toBe(6)
    unpin()
    store.addWays([wayAt(39.47, -0.376)])
    expect(store.size).toBe(2)
  })

  it('por debajo del tope no libera nada', () => {
    const store = new NetworkStore()
    store.configure({ maxWays: 100, targetWays: 50 })
    store.addWays(Array.from({ length: 30 }, (_, i) => wayAt(41 + i * 0.01, 2)))
    expect(store.size).toBe(30)
  })
})
