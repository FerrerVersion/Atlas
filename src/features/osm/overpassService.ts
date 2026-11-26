import { cacheGet, cacheSet, hashKey } from '@/utils/storage'
import { HttpError, RateLimitedClient, sleep } from '@/utils/http'
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
/** Espera antes de reintentar un servidor que respondió 429/5xx. */
export const RETRY_DELAY_MS = 4_000
/** Si un espejo no responde en este tiempo, se lanza el siguiente en paralelo. */
export const HEDGE_MS = 12_000

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

/** Consultas en curso: si se pide la misma (p. ej. precarga + ruta), se reutiliza. */
const inFlight = new Map<string, Promise<OverpassResponse<unknown>>>()

export function queryOverpass<T>(
  ql: string,
  signal?: AbortSignal,
  onRetry?: (host: string) => void,
): Promise<OverpassResponse<T>> {
  const key = `overpass:${hashKey(ql)}`
  const pending = inFlight.get(key)
  if (pending) return abortable(pending as Promise<OverpassResponse<T>>, signal)
  // La descarga compartida no se cancela si un solo interesado se va: otro puede necesitarla.
  const shared = runQuery<T>(ql, key, onRetry).finally(() => inFlight.delete(key))
  inFlight.set(key, shared)
  return abortable(shared, signal)
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => (signal.removeEventListener('abort', onAbort), resolve(v)),
      (e) => (signal.removeEventListener('abort', onAbort), reject(e)),
    )
  })
}

async function runQuery<T>(ql: string, key: string, onRetry?: (host: string) => void): Promise<OverpassResponse<T>> {
  const cached = await cacheGet<OverpassResponse<T>>(key, CACHE_TTL)
  if (cached) return cached

  let lastError: unknown
  const order = OVERPASS_ENDPOINTS.map((_, i) => (preferred + i) % OVERPASS_ENDPOINTS.length)
  const attempt = async (idx: number, sig?: AbortSignal) => {
    const data = await client.request<OverpassResponse<T>>(OVERPASS_ENDPOINTS[idx], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: ql }).toString(),
      signal: sig,
    })
    preferred = idx
    await cacheSet(key, data)
    return data
  }
  const retryable: number[] = []

  // Ronda 1 «escalonada»: si un espejo no contesta en HEDGE_MS se lanza el siguiente
  // en paralelo; gana el primero que responde y se cancelan los demás.
  const hedged = () =>
    new Promise<OverpassResponse<T> | null>((resolve) => {
      const controllers: AbortController[] = []
      let next = 0
      let pending = 0
      let settled = false
      const finish = (value: OverpassResponse<T> | null) => {
        if (settled) return
        settled = true
        controllers.forEach((c) => c.abort())
        resolve(value)
      }
      const launch = () => {
        if (settled || next >= order.length) {
          if (!settled && pending === 0) finish(null)
          return
        }
        const idx = order[next++]
        if (next > 1) onRetry?.(new URL(OVERPASS_ENDPOINTS[idx]).host)
        const ctrl = new AbortController()
        controllers.push(ctrl)
        pending++
        const timer = setTimeout(launch, HEDGE_MS)
        attempt(idx, ctrl.signal).then(finish, (e) => {
          pending--
          clearTimeout(timer)
          if (settled) return
          lastError = e
          if (e instanceof HttpError && e.status === 400) return finish(null)
          if (e instanceof HttpError && (e.status === 429 || e.status >= 500)) retryable.push(idx)
          launch()
        })
      }
      launch()
    })

  const first = await hedged()
  if (first) return first
  if (!(lastError instanceof HttpError && lastError.status === 400)) {
    // Ronda 2: solo los espejos que respondieron rápido con saturación (429/5xx).
    for (const idx of retryable) {
      onRetry?.(`${new URL(OVERPASS_ENDPOINTS[idx]).host} (reintento)`)
      await sleep(RETRY_DELAY_MS)
      try {
        return await attempt(idx)
      } catch (e) {
        lastError = e
      }
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

const ACCESS_ROADS = 'secondary|secondary_link|tertiary|tertiary_link|unclassified'

export interface NetworkQueryPlan {
  /** Zonas con todo el detalle de calles. */
  detail: BBox[]
  /** Solo vías para coche en las zonas de detalle. */
  carOnly?: boolean
  /**
   * Anillos de acceso: carreteras secundarias, terciarias y sin clasificar alrededor
   * de cada parada. Son las que unen los núcleos con autovías y nacionales.
   */
  access?: BBox[]
  /** Corredor con solo vías principales para trayectos largos. */
  corridor?: { bbox: BBox; level: keyof typeof MAJOR_ROADS }
}

export function buildRoadQuery(plan: NetworkQueryPlan): string {
  const detailFilter = plan.carOnly ? `["highway"~"^(${CAR_ROADS})$"]` : `["highway"]["highway"!~"^(${EXCLUDED})$"]`
  const parts = plan.detail.map((b) => `way${detailFilter}(${bboxToOverpass(b)});`)
  for (const b of plan.access ?? []) parts.push(`way["highway"~"^(${ACCESS_ROADS})$"](${bboxToOverpass(b)});`)
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
