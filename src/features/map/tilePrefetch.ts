import { whenBackgroundAllowed } from '@/features/osm/backgroundGate'
import type { TileLayerSpec } from '@/features/themes/themeTypes'
import type { BBox } from '@/utils/geometry'
import { TILE_PROVIDERS } from './tileProviders'

/**
 * Precarga de teselas en segundo plano. Se piden exactamente las mismas URL que
 * Leaflet pedirá luego, así el service worker (CacheFirst, 14 días) o la caché HTTP
 * las sirven al instante.
 *
 * Política de uso de las teselas de OpenStreetMap: está prohibida la descarga masiva
 * por adelantado; a zoom ≥ 13 nunca se precargan más de 250 teselas por operación.
 */
export const BULK_ZOOM = 13
export const MAX_BULK_TILES = 250
/** Zooms de la precarga regional (vista de toda la zona). */
export const REGION_ZOOMS = [5, 6, 7, 8, 9, 10]

export interface TileXYZ {
  x: number
  y: number
  z: number
}

export const lngToTileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
export function latToTileY(lat: number, z: number) {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export function tilesInBBox(b: BBox, z: number): TileXYZ[] {
  const x0 = lngToTileX(b.west, z)
  const x1 = lngToTileX(b.east, z)
  const y0 = latToTileY(b.north, z)
  const y1 = latToTileY(b.south, z)
  const out: TileXYZ[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y, z })
  return out
}

/** Zoom real de la tesela pedida para un nivel dado (los temas pixelados piden un nivel menos). */
export const requestZoom = (spec: TileLayerSpec, z: number) => (spec.pixelated ? z - 1 : z)

/** URL de una tesela, con el mismo subdominio que elegiría Leaflet. */
export function tileUrl(spec: TileLayerSpec, t: TileXYZ): string {
  const p = TILE_PROVIDERS[spec.provider]
  const subs = p.subdomains ?? 'abc'
  return p.url
    .replace('{s}', subs[Math.abs(t.x + t.y) % subs.length])
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
    .replace('{r}', '')
}

/** Ordena por cercanía a un punto (lo más cercano llega antes). */
export function sortByDistance(tiles: TileXYZ[], lat: number, lng: number): TileXYZ[] {
  return [...tiles].sort((a, b) => {
    const da = (a.x + 0.5 - lngToTileX(lng, a.z)) ** 2 + (a.y + 0.5 - latToTileY(lat, a.z)) ** 2
    const db = (b.x + 0.5 - lngToTileX(lng, b.z)) ** 2 + (b.y + 0.5 - latToTileY(lat, b.z)) ** 2
    return a.z - b.z || da - db
  })
}

/** Respeta la política de OSM: como mucho MAX_BULK_TILES teselas de zoom ≥ 13. */
export function capBulk(tiles: TileXYZ[]): TileXYZ[] {
  let bulk = 0
  return tiles.filter((t) => t.z < BULK_ZOOM || ++bulk <= MAX_BULK_TILES)
}

export interface PrefetchProgress {
  done: number
  total: number
}

/**
 * Descarga las URL con pocas peticiones a la vez. Se detiene mientras se calcula una
 * ruta (las teselas compiten por la red con la ruta) y continúa después.
 */
export async function prefetchTiles(
  urls: string[],
  opts: { signal: AbortSignal; concurrency?: number; low?: boolean; onProgress?: (p: PrefetchProgress) => void },
) {
  const unique = [...new Set(urls)]
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < unique.length) {
      await whenBackgroundAllowed(opts.signal, opts.low)
      opts.signal.throwIfAborted()
      const url = unique[next++]
      try {
        // Igual que <img crossorigin> de Leaflet: misma entrada de caché.
        await fetch(url, { mode: 'cors', credentials: 'omit', signal: opts.signal })
      } catch {
        opts.signal.throwIfAborted()
        /* una tesela que falla no detiene el resto */
      }
      opts.onProgress?.({ done: ++done, total: unique.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, unique.length) }, worker))
}

/** Teselas del tema (base y etiquetas) para una lista de posiciones. */
export function themeTileUrls(layers: (TileLayerSpec | null | undefined)[], tiles: TileXYZ[]): string[] {
  const urls: string[] = []
  for (const spec of layers) {
    if (!spec) continue
    const max = TILE_PROVIDERS[spec.provider].maxNativeZoom
    for (const t of tiles) {
      const z = requestZoom(spec, t.z)
      if (z < 0 || z > max || (spec.maxZoom !== undefined && t.z > spec.maxZoom)) continue
      // Para los temas pixelados, la tesela de un nivel menos cubre el doble.
      const tt = z === t.z ? t : { x: t.x >> 1, y: t.y >> 1, z }
      urls.push(tileUrl(spec, tt))
    }
  }
  return urls
}
