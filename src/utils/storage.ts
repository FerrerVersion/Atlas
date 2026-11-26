import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'

/**
 * Caché persistente en IndexedDB para datos geográficos voluminosos (respuestas de
 * Overpass) y para los mapas personalizados.
 *
 * - Una sola copia: los datos viven en IndexedDB. La memoria solo se usa como
 *   respaldo (acotado) cuando IndexedDB no está disponible (modo privado, tests).
 * - Las entradas con política (p. ej. `overpass:`) tienen caducidad y límites de
 *   cantidad y tamaño: se borran las caducadas al arrancar y, al pasarse del límite,
 *   las más antiguas. Un índice guarda fecha y tamaño aproximado de cada una.
 * - Lo que no tiene política (mapas personalizados) es del usuario: nunca se borra solo.
 */

export interface CachePolicy {
  prefix: string
  ttlMs: number
  maxEntries: number
  /** Bytes aproximados (tamaño estimado de lo guardado). */
  maxBytes: number
}

export const CACHE_POLICIES: CachePolicy[] = [
  { prefix: 'overpass:', ttlMs: 7 * 24 * 3600 * 1000, maxEntries: 400, maxBytes: 200 * 1024 * 1024 },
]

/** Entradas máximas en memoria cuando no hay IndexedDB. */
export const MEMORY_MAX_ENTRIES = 40
const INDEX_KEY = '__atlas-cache-index__'

/** Almacén clave-valor (IndexedDB en la app; sustituible en los tests). */
export interface KVBackend {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

interface Entry<T> {
  savedAt: number
  value: T
}
type Index = Record<string, { savedAt: number; size: number }>

const policyFor = (key: string) => CACHE_POLICIES.find((p) => key.startsWith(p.prefix))

/* ------------------------------ Almacén ------------------------------ */

let backend: KVBackend | null | undefined

function idbBackend(): KVBackend | null {
  if (typeof indexedDB === 'undefined') return null
  try {
    const store: UseStore = createStore('atlas-nav', 'kv')
    return {
      get: (k) => get(k, store),
      set: (k, v) => set(k, v, store),
      del: (k) => del(k, store),
      keys: async () => ((await keys(store)) as unknown[]).filter((k): k is string => typeof k === 'string'),
    }
  } catch {
    return null
  }
}

function getBackend(): KVBackend | null {
  if (backend === undefined) backend = idbBackend()
  return backend
}

/** Solo para tests: usa otro almacén (o ninguno, para probar el respaldo en memoria). */
export function setCacheBackendForTests(b: KVBackend | null) {
  backend = b
  memory.clear()
  indexQueue = Promise.resolve()
}

/* --------------------- Respaldo en memoria (acotado) -------------------- */

const memory = new Map<string, Entry<unknown>>()
function memorySet(key: string, entry: Entry<unknown>) {
  memory.delete(key)
  memory.set(key, entry)
  while (memory.size > MEMORY_MAX_ENTRIES) memory.delete(memory.keys().next().value!)
}

/* ------------------------------- Índice ------------------------------- */

/** Las actualizaciones del índice se encadenan (nunca dos a la vez). */
let indexQueue: Promise<unknown> = Promise.resolve()
function withIndex<R>(fn: (b: KVBackend, index: Index) => Promise<R>): Promise<R | undefined> {
  const b = getBackend()
  if (!b) return Promise.resolve(undefined)
  const run = indexQueue.then(async () => {
    const index = ((await b.get<Index>(INDEX_KEY)) ?? {}) as Index
    const result = await fn(b, index)
    await b.set(INDEX_KEY, index)
    return result
  })
  indexQueue = run.catch(() => undefined)
  return run.catch(() => undefined)
}

/** Borra lo que sobra de una política: primero lo caducado y después lo más antiguo. */
async function enforce(b: KVBackend, index: Index, policy: CachePolicy, now = Date.now()) {
  const items = Object.entries(index)
    .filter(([k]) => k.startsWith(policy.prefix))
    .sort((a, b2) => a[1].savedAt - b2[1].savedAt)
  let bytes = items.reduce((a, [, m]) => a + m.size, 0)
  let count = items.length
  for (const [k, meta] of items) {
    const expired = now - meta.savedAt > policy.ttlMs
    if (!expired && count <= policy.maxEntries && bytes <= policy.maxBytes) break
    await b.del(k).catch(() => undefined)
    delete index[k]
    count--
    bytes -= meta.size
  }
}

/* --------------------------------- API --------------------------------- */

export async function cacheGet<T>(key: string, maxAgeMs = Infinity): Promise<T | undefined> {
  const b = getBackend()
  let entry: Entry<T> | undefined
  try {
    entry = b ? await b.get<Entry<T>>(key) : (memory.get(key) as Entry<T> | undefined)
  } catch {
    entry = memory.get(key) as Entry<T> | undefined
  }
  if (!entry) return undefined
  const ttl = Math.min(maxAgeMs, policyFor(key)?.ttlMs ?? Infinity)
  if (Date.now() - entry.savedAt > ttl) {
    void cacheDelete(key)
    return undefined
  }
  return entry.value
}

/**
 * Guarda un valor. `size` = tamaño aproximado en bytes (para el límite de la
 * política); si no se indica se estima con su JSON.
 */
export async function cacheSet<T>(key: string, value: T, opts: { size?: number } = {}): Promise<void> {
  const entry: Entry<T> = { savedAt: Date.now(), value }
  const b = getBackend()
  if (!b) {
    memorySet(key, entry)
    return
  }
  const policy = policyFor(key)
  const size = policy ? (opts.size ?? estimateSize(value)) : 0
  try {
    await b.set(key, entry)
  } catch {
    // Cuota llena: se libera espacio de la caché (nunca de los mapas del usuario) y se
    // reintenta una vez; si sigue sin caber, se queda solo en memoria.
    if (!policy) throw new Error('No queda espacio en el navegador para guardar el mapa.')
    await withIndex(async (bk, index) => enforce(bk, index, { ...policy, maxBytes: 0 }))
    try {
      await b.set(key, entry)
    } catch {
      memorySet(key, entry)
      return
    }
  }
  if (policy) {
    await withIndex(async (bk, index) => {
      index[key] = { savedAt: entry.savedAt, size }
      await enforce(bk, index, policy)
    })
  }
}

export async function cacheDelete(key: string) {
  memory.delete(key)
  const b = getBackend()
  if (!b) return
  await b.del(key).catch(() => undefined)
  if (policyFor(key)) {
    await withIndex(async (_bk, index) => {
      delete index[key]
    })
  }
}

export async function cacheKeys(prefix: string): Promise<string[]> {
  const b = getBackend()
  const all = b ? await b.keys().catch(() => [] as string[]) : [...memory.keys()]
  return all.filter((k) => k !== INDEX_KEY && k.startsWith(prefix))
}

export async function cacheClear(prefix: string) {
  for (const k of await cacheKeys(prefix)) await cacheDelete(k)
}

/**
 * Limpieza al arrancar: borra lo caducado, lo que pase de los límites y las entradas
 * de caché sin índice (p. ej. de versiones anteriores con otro formato de clave).
 */
export async function purgeCache(now = Date.now()) {
  const b = getBackend()
  if (!b) return
  const stored = await b.keys().catch(() => [] as string[])
  await withIndex(async (bk, index) => {
    for (const k of stored) {
      if (k !== INDEX_KEY && policyFor(k) && !index[k]) await bk.del(k).catch(() => undefined)
    }
    for (const k of Object.keys(index)) if (!stored.includes(k)) delete index[k]
    for (const policy of CACHE_POLICIES) await enforce(bk, index, policy, now)
  })
}

/** Tamaño aproximado (bytes) de un valor serializable. */
export function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}

/** Lectura/escritura segura de LocalStorage (JSON). */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  },
}
