import { cacheGet, cacheSet, hashKey } from '@/utils/storage'
import { HttpError, RateLimitedClient } from '@/utils/http'
import { bboxToOverpass, type BBox } from '@/utils/geometry'
import type { OsmWay } from '@/features/routing/graph'
import { POI_CATEGORY_MAP, poisFromOsm, type OsmPoiElement, type POI, type PoiCategory } from '@/features/poi/poiTypes'

/**
 * Servicio Overpass API (OpenStreetMap). Endpoints configurables mediante
 * VITE_OVERPASS_URLS (lista separada por comas). Con caché en IndexedDB de
 * 7 días y cola con un mínimo de 1,2 s entre peticiones.
 */
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
/** Tiempo máximo por servidor antes de probar el siguiente espejo. */
const ENDPOINT_TIMEOUT_MS = 45_000

export const OVERPASS_ENDPOINTS: string[] = (import.meta.env.VITE_OVERPASS_URLS as string | undefined)
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? DEFAULT_ENDPOINTS

const client = new RateLimitedClient(1200, ENDPOINT_TIMEOUT_MS)
/** Índice del último espejo que respondió: se prueba primero la próxima vez. */
let preferred = 0
const CACHE_TTL = 7 * 24 * 3600 * 1000

interface OverpassResponse<T> {
  elements: T[]
  osm3s?: { timestamp_osm_base?: string }
}

export class OverpassError extends Error {}

export async function queryOverpass<T>(
  ql: string,
  signal?: AbortSignal,
  onRetry?: (host: string) => void,
): Promise<OverpassResponse<T>> {
  const key = `overpass:${hashKey(ql)}`
  const cached = await cacheGet<OverpassResponse<T>>(key, CACHE_TTL)
  if (cached) return cached

  let lastError: unknown
  const order = OVERPASS_ENDPOINTS.map((_, i) => (preferred + i) % OVERPASS_ENDPOINTS.length)
  for (const [n, idx] of order.entries()) {
    const endpoint = OVERPASS_ENDPOINTS[idx]
    if (n > 0) onRetry?.(new URL(endpoint).host)
    try {
      const data = await client.request<OverpassResponse<T>>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: ql }).toString(),
        signal,
      })
      preferred = idx
      await cacheSet(key, data)
      return data
    } catch (e) {
      // Cancelación del usuario: se propaga. Timeout (408) o error de red: siguiente espejo.
      if (signal?.aborted) throw e
      lastError = e
      if (e instanceof HttpError && e.status === 400) break
    }
  }
  const status = lastError instanceof HttpError ? ` (${lastError.status})` : ''
  throw new OverpassError(
    `No se pudieron descargar datos de OpenStreetMap${status}. El servidor Overpass puede estar saturado: inténtalo en unos segundos o usa los datos demo.`,
  )
}

/* -------------------------------- Carreteras ------------------------------- */

const EXCLUDED = 'proposed|construction|abandoned|platform|bus_stop|elevator|corridor|raceway|bus_guideway|razed|via_ferrata'

export const MAJOR_ROADS: Record<'tertiary' | 'secondary' | 'primary' | 'trunk', string> = {
  tertiary: 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link',
  secondary: 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link',
  primary: 'motorway|motorway_link|trunk|trunk_link|primary|primary_link',
  trunk: 'motorway|motorway_link|trunk|trunk_link',
}

/** Vías transitables en coche (evita descargar aceras y senderos: mucho menos peso). */
const CAR_ROADS =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service'

export interface NetworkQueryPlan {
  /** Zonas con todo el detalle de calles. */
  detail: BBox[]
  /** Solo vías para coche en las zonas de detalle. */
  carOnly?: boolean
  /** Corredor con solo vías principales para trayectos largos. */
  corridor?: { bbox: BBox; level: keyof typeof MAJOR_ROADS }
}

export function buildRoadQuery(plan: NetworkQueryPlan): string {
  const detailFilter = plan.carOnly ? `["highway"~"^(${CAR_ROADS})$"]` : `["highway"]["highway"!~"^(${EXCLUDED})$"]`
  const parts = plan.detail.map((b) => `way${detailFilter}(${bboxToOverpass(b)});`)
  if (plan.corridor) {
    parts.push(`way["highway"~"^(${MAJOR_ROADS[plan.corridor.level]})$"](${bboxToOverpass(plan.corridor.bbox)});`)
  }
  return `[out:json][timeout:90];(${parts.join('')});out body geom qt;`
}

export async function fetchRoadNetwork(
  plan: NetworkQueryPlan,
  signal?: AbortSignal,
  onRetry?: (host: string) => void,
): Promise<OsmWay[]> {
  const res = await queryOverpass<OsmWay>(buildRoadQuery(plan), signal, onRetry)
  return res.elements.filter((e) => e.type === 'way' && Array.isArray(e.geometry) && Array.isArray(e.nodes))
}

/* ----------------------------------- POIs ---------------------------------- */

export function buildPoiQuery(categories: PoiCategory[], bbox: BBox, limit = 300): string {
  const b = bboxToOverpass(bbox)
  const sel = categories.flatMap((c) => POI_CATEGORY_MAP[c].selectors.map((s) => `${s}(${b});`))
  return `[out:json][timeout:40];(${sel.join('')});out center tags ${limit};`
}

export async function fetchPois(categories: PoiCategory[], bbox: BBox, signal?: AbortSignal): Promise<POI[]> {
  if (categories.length === 0) return []
  const res = await queryOverpass<OsmPoiElement>(buildPoiQuery(categories, bbox), signal)
  return poisFromOsm(res.elements, categories)
}
