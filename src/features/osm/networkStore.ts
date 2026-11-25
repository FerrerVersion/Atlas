import { useSyncExternalStore } from 'react'
import { buildGraphFromOsm, type OsmWay } from '@/features/routing/graph'
import type { RoadGraph, TravelProfile } from '@/features/routing/routeTypes'
import { bboxContains, bboxIntersects, type BBox } from '@/utils/geometry'

/**
 * Almacén en memoria de la red viaria descargada (vías OSM reales).
 * Es independiente del tema visual: cambiar de estilo nunca lo modifica.
 */
class NetworkStore {
  private ways = new Map<number, OsmWay & { bbox: BBox }>()
  private graphs = new Map<TravelProfile, { version: number; graph: RoadGraph }>()
  private listeners = new Set<() => void>()
  private loadedCells = new Set<string>()
  /** Zonas descargadas con todo el detalle de calles. */
  private coverage: BBox[] = []
  version = 0

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  addWays(ways: OsmWay[]) {
    let added = 0
    for (const w of ways) {
      if (this.ways.has(w.id)) continue
      let south = Infinity
      let north = -Infinity
      let west = Infinity
      let east = -Infinity
      for (const p of w.geometry) {
        if (p.lat < south) south = p.lat
        if (p.lat > north) north = p.lat
        if (p.lon < west) west = p.lon
        if (p.lon > east) east = p.lon
      }
      this.ways.set(w.id, { ...w, bbox: { south, north, west, east } })
      added++
    }
    if (added > 0) this.bump()
    return added
  }

  /** Registra zonas cuyas calles se han cargado completas. */
  addCoverage(boxes: BBox[]) {
    this.coverage.push(...boxes)
  }

  /** ¿Está la zona completamente dentro de lo ya cargado? (esquinas y centro). */
  covers(b: BBox): boolean {
    const pts: [number, number][] = [
      [b.south, b.west],
      [b.south, b.east],
      [b.north, b.west],
      [b.north, b.east],
      [(b.south + b.north) / 2, (b.west + b.east) / 2],
    ]
    return pts.every(([lat, lng]) => this.coverage.some((c) => bboxContains(c, lat, lng)))
  }

  clear() {
    this.ways.clear()
    this.coverage = []
    this.loadedCells.clear()
    this.graphs.clear()
    this.bump()
  }

  get size() {
    return this.ways.size
  }

  allWays(): Iterable<OsmWay> {
    return this.ways.values()
  }

  waysInBBox(b: BBox): OsmWay[] {
    const out: OsmWay[] = []
    for (const w of this.ways.values()) if (bboxIntersects(w.bbox, b)) out.push(w)
    return out
  }

  /** Nombres de calle reales presentes en los datos cargados. */
  streetIndex(): Map<string, { name: string; lat: number; lng: number; highway: string }> {
    const idx = new Map<string, { name: string; lat: number; lng: number; highway: string }>()
    for (const w of this.ways.values()) {
      const name = w.tags.name
      if (!name || idx.has(name)) continue
      const mid = w.geometry[Math.floor(w.geometry.length / 2)]
      idx.set(name, { name, lat: mid.lat, lng: mid.lon, highway: w.tags.highway })
    }
    return idx
  }

  graph(profile: TravelProfile): RoadGraph {
    const cached = this.graphs.get(profile)
    if (cached && cached.version === this.version) return cached.graph
    const graph = buildGraphFromOsm(this.ways.values(), { profile })
    this.graphs.set(profile, { version: this.version, graph })
    return graph
  }

  hasCell(key: string) {
    return this.loadedCells.has(key)
  }

  markCells(keys: string[]) {
    keys.forEach((k) => this.loadedCells.add(k))
  }

  private bump() {
    this.version++
    this.listeners.forEach((l) => l())
  }
}

export const networkStore = new NetworkStore()

export function useNetworkVersion() {
  return useSyncExternalStore(networkStore.subscribe, networkStore.getVersion, networkStore.getVersion)
}

/* --------------------- Rejilla para carga por zonas visibles -------------------- */

export const CELL_SIZE = 0.015

export function cellsForBBox(b: BBox): { key: string; bbox: BBox }[] {
  const cells: { key: string; bbox: BBox }[] = []
  const i0 = Math.floor(b.south / CELL_SIZE)
  const i1 = Math.floor(b.north / CELL_SIZE)
  const j0 = Math.floor(b.west / CELL_SIZE)
  const j1 = Math.floor(b.east / CELL_SIZE)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      cells.push({
        key: `${i}:${j}`,
        bbox: { south: i * CELL_SIZE, north: (i + 1) * CELL_SIZE, west: j * CELL_SIZE, east: (j + 1) * CELL_SIZE },
      })
    }
  }
  return cells
}
