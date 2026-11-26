import { useSyncExternalStore } from 'react'
import { haversine, type LatLngTuple } from '@/utils/distance'
import { bboxToOverpass, type BBox } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { cacheGet, cacheSet } from '@/utils/storage'
import { onBackgroundPause, whenBackgroundAllowed } from './backgroundGate'
import { queryOverpass } from './overpassService'

/**
 * Red regional: autopistas y autovías REALES (OSM) en 200 km alrededor del usuario,
 * para que el mapa del tema se vea completo al alejarse. Solo se dibuja: no entra en
 * el grafo de rutas (que usa sus propias descargas), así no lo hace más lento.
 *
 * Se descarga por celdas fijas de 1° (≈ 110 × 85 km) de la más cercana a la más
 * lejana, en segundo plano, y cada celda queda en caché 7 días (IndexedDB).
 */
export const REGION_RADIUS_M = 200_000
/** Tamaño de celda (grados). Fijo y alineado: al moverse se reutilizan las ya descargadas. */
export const REGION_CELL_DEG = 1
export const REGIONAL_TYPES = 'motorway|motorway_link|trunk|trunk_link'
/** Una celda regional legítimamente puede tardar (10-50 s según el servidor). */
const REGION_TIMEOUT_MS = 100_000
const CACHE_TTL = 7 * 24 * 3600 * 1000
/** Versión del formato compacto guardado en caché. */
const CACHE_PREFIX = 'region:v1:'

export interface RegionalWay {
  id: number
  highway: string
  geometry: LatLngTuple[]
}

export interface RegionCell {
  key: string
  bbox: BBox
  /** Distancia desde el centro hasta el punto más cercano de la celda. */
  distance: number
}

/**
 * Elemento devuelto por Overpass: con `convert` llega como GeoJSON
 * (`geometry.coordinates` en [lon, lat]); sin él, como lista de {lat, lon}.
 */
export interface OverpassGeomWay {
  type: string
  id: number | string
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[] | { type: string; coordinates: [number, number][] }
}

/** Celdas que tocan el círculo de `radius` metros, ordenadas de la más cercana a la más lejana. */
export function regionCells(lat: number, lng: number, radius = REGION_RADIUS_M, size = REGION_CELL_DEG): RegionCell[] {
  const dLat = radius / 111_320
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180))
  const cells: RegionCell[] = []
  for (let s = Math.floor((lat - dLat) / size) * size; s < lat + dLat; s += size) {
    for (let w = Math.floor((lng - dLng) / size) * size; w < lng + dLng; w += size) {
      const bbox = { south: s, west: w, north: s + size, east: w + size }
      const nearLat = Math.min(Math.max(lat, bbox.south), bbox.north)
      const nearLng = Math.min(Math.max(lng, bbox.west), bbox.east)
      const distance = haversine(lat, lng, nearLat, nearLng)
      if (distance > radius) continue
      cells.push({ key: `${s.toFixed(2)},${w.toFixed(2)}`, bbox, distance })
    }
  }
  return cells.sort((a, b) => a.distance - b.distance)
}

/** Solo id, tipo y geometría (`convert` quita el resto de etiquetas: la mitad de peso). */
export const regionalQuery = (b: BBox) =>
  `[out:json][timeout:120];way["highway"~"^(${REGIONAL_TYPES})$"](${bboxToOverpass(b)});` +
  'convert way ::id=id(),highway=t["highway"],::geom=geom();out geom qt;'

/** Conserva solo lo que se dibuja (tipo y geometría): mucha menos memoria. */
export function toRegionalWays(elements: OverpassGeomWay[]): RegionalWay[] {
  const out: RegionalWay[] = []
  for (const e of elements) {
    const highway = e.tags?.highway
    const g = e.geometry
    if (e.type !== 'way' || !highway || !g) continue
    const geometry: LatLngTuple[] = Array.isArray(g)
      ? g.map((p) => [p.lat, p.lon])
      : Array.isArray(g.coordinates)
        ? g.coordinates.map(([lon, lat]) => [lat, lon])
        : []
    if (geometry.length < 2) continue
    out.push({ id: Number(e.id), highway, geometry })
  }
  return out
}

/** Formato compacto en caché: coordenadas a 5 decimales (~1 m), planas. */
interface CompactCell {
  ids: number[]
  types: string[]
  /** Nº de puntos de cada vía. */
  counts: number[]
  /** lat, lng, lat, lng… × 1e5 */
  coords: number[]
}

export function compactWays(ways: RegionalWay[]): CompactCell {
  const c: CompactCell = { ids: [], types: [], counts: [], coords: [] }
  for (const w of ways) {
    c.ids.push(w.id)
    c.types.push(w.highway)
    c.counts.push(w.geometry.length)
    for (const [lat, lng] of w.geometry) c.coords.push(Math.round(lat * 1e5), Math.round(lng * 1e5))
  }
  return c
}

export function expandWays(c: CompactCell): RegionalWay[] {
  const out: RegionalWay[] = []
  let k = 0
  for (let i = 0; i < c.ids.length; i++) {
    const geometry: LatLngTuple[] = []
    for (let j = 0; j < c.counts[i]; j++, k += 2) geometry.push([c.coords[k] / 1e5, c.coords[k + 1] / 1e5])
    out.push({ id: c.ids[i], highway: c.types[i], geometry })
  }
  return out
}

/** Una celda: de la caché compacta si existe; si no, de Overpass (en segundo plano). */
async function fetchRegionCell(cell: RegionCell, signal: AbortSignal): Promise<RegionalWay[]> {
  const cacheKey = CACHE_PREFIX + cell.key
  const cached = await cacheGet<CompactCell>(cacheKey, CACHE_TTL)
  if (cached) return expandWays(cached)
  const res = await queryOverpass<OverpassGeomWay>(regionalQuery(cell.bbox), signal, undefined, undefined, {
    background: true,
    timeoutMs: REGION_TIMEOUT_MS,
    cache: false,
  })
  const ways = toRegionalWays(res.elements)
  await cacheSet(cacheKey, compactWays(ways))
  return ways
}

export interface RegionProgress {
  total: number
  done: number
  /** Celdas que no se pudieron descargar (se reintentan en la próxima visita). */
  failed: number
  running: boolean
}

class RegionalRoadsStore {
  private cells = new Map<string, { bbox: BBox; ways: RegionalWay[] }>()
  private listeners = new Set<() => void>()
  version = 0
  progress: RegionProgress = { total: 0, done: 0, failed: 0, running: false }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getVersion = () => this.version
  getProgress = () => this.progress

  has = (key: string) => this.cells.has(key)

  add(key: string, bbox: BBox, ways: RegionalWay[]) {
    this.cells.set(key, { bbox, ways })
    this.bump()
  }

  /** Celdas cargadas (cada una se dibuja como grupo propio: Leaflet descarta las que no se ven). */
  allCells() {
    return this.cells.values()
  }

  get size() {
    let n = 0
    for (const c of this.cells.values()) n += c.ways.length
    return n
  }

  setProgress(p: Partial<RegionProgress>) {
    this.progress = { ...this.progress, ...p }
    this.listeners.forEach((l) => l())
  }

  clear() {
    this.cells.clear()
    this.bump()
  }

  private bump() {
    this.version++
    this.listeners.forEach((l) => l())
  }
}

export const regionalRoads = new RegionalRoadsStore()

export const useRegionalVersion = () =>
  useSyncExternalStore(regionalRoads.subscribe, regionalRoads.getVersion, regionalRoads.getVersion)
export const useRegionProgress = () =>
  useSyncExternalStore(regionalRoads.subscribe, regionalRoads.getProgress, regionalRoads.getProgress)

/**
 * Descarga la red regional alrededor de un punto. Se detiene (y cancela la consulta
 * en curso) mientras se calcula una ruta, y continúa después por la misma celda.
 */
export async function loadRegionalRoads(lat: number, lng: number, signal: AbortSignal) {
  const cells = regionCells(lat, lng)
  const pending = cells.filter((c) => !regionalRoads.has(c.key))
  regionalRoads.setProgress({ total: cells.length, done: cells.length - pending.length, failed: 0, running: pending.length > 0 })
  try {
    for (const cell of pending) {
      for (;;) {
        await whenBackgroundAllowed(signal, true)
        // Si se pausa a mitad de descarga, se cancela esa consulta y se repite luego.
        const ctrl = new AbortController()
        const stop = () => ctrl.abort()
        signal.addEventListener('abort', stop, { once: true })
        const off = onBackgroundPause(stop, true)
        try {
          regionalRoads.add(cell.key, cell.bbox, await fetchRegionCell(cell, ctrl.signal))
          regionalRoads.setProgress({ done: regionalRoads.progress.done + 1 })
          break
        } catch (e) {
          signal.throwIfAborted()
          if (isAbortError(e)) continue // pausa por cálculo de ruta: se reintenta la misma celda
          regionalRoads.setProgress({ done: regionalRoads.progress.done + 1, failed: regionalRoads.progress.failed + 1 })
          break
        } finally {
          off()
          signal.removeEventListener('abort', stop)
        }
      }
    }
  } finally {
    regionalRoads.setProgress({ running: false })
  }
}
