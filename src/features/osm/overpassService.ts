import { cacheGet, cacheSet } from '@/utils/storage'
import { HttpError, RateLimitedClient, sleep } from '@/utils/http'
import { bboxToOverpass, type BBox } from '@/utils/geometry'
import type { OsmWay } from '@/features/routing/graph'
import { POI_CATEGORY_MAP, poisFromOsm, type OsmPoiElement, type POI, type PoiCategory } from '@/features/poi/poiTypes'

/**
 * Servicio Overpass API (OpenStreetMap). Endpoints configurables mediante
 * VITE_OVERPASS_URLS (lista separada por comas). Con caché en IndexedDB de
 * 7 días, como mucho 2 consultas a la vez y 0,6 s entre inicios de petición.
 *
 * Los espejos se prueban de uno en uno: son servicios gratuitos y compartidos, pensados
 * para uso ligero. Única excepción: si el primero no ha respondido en BACKUP_AFTER_MS,
 * se lanza UN respaldo en el siguiente (como mucho 2 servidores a la vez por consulta,
 * y solo una vez); gana el que responda antes y el otro se cancela.
 */
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
/** Tiempo máximo de un servidor antes de pasar al siguiente espejo. */
export const ENDPOINT_TIMEOUT_MS = 25_000
/** Las consultas grandes (corredores de trayectos largos) tardan más de forma legítima. */
export const ENDPOINT_TIMEOUT_LARGE_MS = 60_000
/** Si el servidor no ha respondido en este tiempo, se lanza un único respaldo en otro espejo. */
export const BACKUP_AFTER_MS = 15_000
/** Las consultas grandes tardan más de forma legítima: el respaldo espera más. */
export const BACKUP_AFTER_LARGE_MS = 30_000
/** Espera antes de reintentar un servidor que respondió 429/5xx (se dobla en cada ronda). */
export const RETRY_DELAY_MS = 4_000
/** Rondas de reintento para los servidores saturados (responden rápido con 429/5xx). */
export const RETRY_ROUNDS = 2

export const OVERPASS_ENDPOINTS: string[] = (import.meta.env.VITE_OVERPASS_URLS as string | undefined)
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? DEFAULT_ENDPOINTS

const client = new RateLimitedClient(600, ENDPOINT_TIMEOUT_MS)
const PREF_KEY = 'atlas-nav:overpass-preferido'
/** Último espejo que respondió, recordado entre visitas (no se empieza por uno caído). */
let preferred = (() => {
  try {
    const url = localStorage.getItem(PREF_KEY)
    const idx = url ? OVERPASS_ENDPOINTS.indexOf(url) : -1
    return idx >= 0 ? idx : 0
  } catch {
    return 0
  }
})()
function rememberPreferred(idx: number) {
  if (preferred === idx) return
  preferred = idx
  try {
    localStorage.setItem(PREF_KEY, OVERPASS_ENDPOINTS[idx])
  } catch {
    /* almacenamiento no disponible */
  }
}
const CACHE_TTL = 7 * 24 * 3600 * 1000

interface OverpassResponse<T> {
  elements: T[]
  osm3s?: { timestamp_osm_base?: string }
}

export class OverpassError extends Error {}

/**
 * Como mucho 2 consultas reales a la vez (lo que admiten los servidores públicos por
 * usuario). Esperar a una consulta ya en curso no ocupa plaza (se reutiliza).
 */
export const MAX_CONCURRENT_QUERIES = 2
let running = 0
const waiting: (() => void)[] = []
async function acquireSlot() {
  if (running < MAX_CONCURRENT_QUERIES) {
    running++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
}
function releaseSlot() {
  const next = waiting.shift()
  if (next) next()
  else running--
}

/** Consultas en curso: si se pide la misma (p. ej. precarga + ruta), se reutiliza. */
const inFlight = new Map<string, Promise<OverpassResponse<unknown>>>()

export function queryOverpass<T>(
  ql: string,
  signal?: AbortSignal,
  onRetry?: (host: string) => void,
  timeoutMs = ENDPOINT_TIMEOUT_MS,
  backupAfterMs = BACKUP_AFTER_MS,
): Promise<OverpassResponse<T>> {
  // Clave = texto completo de la consulta (sin hash: imposible confundir dos zonas).
  const key = `overpass:v2:${ql}`
  const pending = inFlight.get(key)
  if (pending) return abortable(pending as Promise<OverpassResponse<T>>, signal)
  // La descarga compartida no se cancela si un solo interesado se va: otro puede necesitarla.
  const shared = (async () => {
    const cached = await cacheGet<OverpassResponse<T>>(key, CACHE_TTL)
    if (cached) return cached
    await acquireSlot()
    try {
      return await runQuery<T>(ql, key, onRetry, timeoutMs, backupAfterMs)
    } finally {
      releaseSlot()
    }
  })().finally(() => inFlight.delete(key))
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

/**
 * Prueba los espejos en orden (primero el último que respondió). Si uno falla o no
 * contesta a tiempo se pasa al siguiente; si tarda más de `backupAfterMs` sin fallar,
 * se lanza un único respaldo en el siguiente y gana el primero que responda. Después, hasta RETRY_ROUNDS rondas (con
 * pausas de 4 s y 8 s) solo con los que respondieron con saturación (429/5xx): esos
 * rechazan al instante, así que reintentarlos cuesta poco y no carga al servidor.
 */
async function runQuery<T>(
  ql: string,
  key: string,
  onRetry: ((host: string) => void) | undefined,
  timeoutMs: number,
  backupAfterMs: number,
): Promise<OverpassResponse<T>> {
  const cached = await cacheGet<OverpassResponse<T>>(key, CACHE_TTL)
  if (cached) return cached

  let lastError: unknown
  const attempt = async (idx: number, signal?: AbortSignal) => {
    const data = await client.request<OverpassResponse<T>>(
      OVERPASS_ENDPOINTS[idx],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: ql }).toString(),
        signal,
      },
      timeoutMs,
    )
    rememberPreferred(idx)
    await cacheSet(key, data, { size: approxResponseSize(data) })
    return data
  }

  const order = OVERPASS_ENDPOINTS.map((_, i) => (preferred + i) % OVERPASS_ENDPOINTS.length)
  const retryable: number[] = []

  // Primera pasada: de uno en uno, con un único respaldo si el servidor se demora.
  const firstPass = () =>
    new Promise<OverpassResponse<T> | null>((resolve) => {
      const controllers: AbortController[] = []
      let next = 0
      let running = 0
      let settled = false
      let backupUsed = false
      let backupTimer: ReturnType<typeof setTimeout> | undefined
      const finish = (value: OverpassResponse<T> | null) => {
        if (settled) return
        settled = true
        clearTimeout(backupTimer)
        controllers.forEach((c) => c.abort())
        resolve(value)
      }
      const launch = () => {
        if (settled) return
        if (next >= order.length) {
          if (running === 0) finish(null)
          return
        }
        const idx = order[next++]
        if (next > 1) onRetry?.(new URL(OVERPASS_ENDPOINTS[idx]).host)
        const ctrl = new AbortController()
        controllers.push(ctrl)
        running++
        // Respaldo: solo una vez por consulta y solo si este servidor sigue sin responder.
        if (!backupUsed) {
          clearTimeout(backupTimer)
          backupTimer = setTimeout(() => {
            if (settled || backupUsed || next >= order.length) return
            backupUsed = true
            launch()
          }, backupAfterMs)
        }
        attempt(idx, ctrl.signal).then(finish, (e) => {
          running--
          if (settled) return
          lastError = e
          // Consulta mal formada: ningún espejo la va a aceptar.
          if (e instanceof HttpError && e.status === 400) return finish(null)
          if (e instanceof HttpError && (e.status === 429 || e.status >= 500)) retryable.push(idx)
          // Si el respaldo sigue en marcha se le espera; si no, se pasa al siguiente.
          if (running === 0) launch()
        })
      }
      launch()
    })

  const first = await firstPass()
  if (first) return first
  let pendingRetry = retryable
  for (let round = 0; round < RETRY_ROUNDS && pendingRetry.length > 0; round++) {
    if (lastError instanceof HttpError && lastError.status === 400) break
    const next: number[] = []
    for (const idx of pendingRetry) {
      onRetry?.(`${new URL(OVERPASS_ENDPOINTS[idx]).host} (reintento)`)
      await sleep(RETRY_DELAY_MS * 2 ** round)
      try {
        return await attempt(idx)
      } catch (e) {
        lastError = e
        if (e instanceof HttpError && (e.status === 429 || e.status >= 500)) next.push(idx)
      }
    }
    pendingRetry = next
  }
  const status = lastError instanceof HttpError ? ` (${lastError.status})` : ''
  throw new OverpassError(
    `No se pudieron descargar datos de OpenStreetMap${status}. El servidor Overpass puede estar saturado: inténtalo en unos segundos o usa los datos demo.`,
  )
}

/**
 * Tamaño aproximado de una respuesta (para el límite de la caché) sin serializarla:
 * ~60 bytes por punto de geometría y ~150 por elemento (medido con datos reales).
 */
function approxResponseSize(data: OverpassResponse<unknown>): number {
  let points = 0
  for (const e of data.elements as { geometry?: unknown[] }[]) points += Array.isArray(e?.geometry) ? e.geometry.length : 0
  return points * 60 + data.elements.length * 150
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
  const res = await queryOverpass<OsmWay>(
    buildRoadQuery(plan),
    signal,
    onRetry,
    plan.corridor ? ENDPOINT_TIMEOUT_LARGE_MS : ENDPOINT_TIMEOUT_MS,
    plan.corridor ? BACKUP_AFTER_LARGE_MS : BACKUP_AFTER_MS,
  )
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
