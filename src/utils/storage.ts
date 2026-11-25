import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'

/**
 * Caché persistente en IndexedDB para datos geográficos voluminosos
 * (respuestas de Overpass, mapas personalizados). Degrada a memoria si
 * IndexedDB no está disponible (tests, modo privado).
 */
const memory = new Map<string, unknown>()
let store: UseStore | null = null

function getStore(): UseStore | null {
  if (store) return store
  if (typeof indexedDB === 'undefined') return null
  try {
    store = createStore('atlas-nav', 'kv')
    return store
  } catch {
    return null
  }
}

interface Entry<T> {
  savedAt: number
  value: T
}

export async function cacheGet<T>(key: string, maxAgeMs = Infinity): Promise<T | undefined> {
  const s = getStore()
  let entry: Entry<T> | undefined
  try {
    entry = s ? await get<Entry<T>>(key, s) : (memory.get(key) as Entry<T> | undefined)
  } catch {
    entry = memory.get(key) as Entry<T> | undefined
  }
  if (!entry) return undefined
  if (Date.now() - entry.savedAt > maxAgeMs) return undefined
  return entry.value
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const entry: Entry<T> = { savedAt: Date.now(), value }
  memory.set(key, entry)
  const s = getStore()
  if (!s) return
  try {
    await set(key, entry, s)
  } catch {
    /* cuota excedida o IDB no disponible: queda en memoria */
  }
}

export async function cacheDelete(key: string) {
  memory.delete(key)
  const s = getStore()
  if (s) await del(key, s).catch(() => undefined)
}

export async function cacheKeys(prefix: string): Promise<string[]> {
  const s = getStore()
  const all = s ? ((await keys(s).catch(() => [])) as string[]) : [...memory.keys()]
  return all.filter((k) => typeof k === 'string' && k.startsWith(prefix))
}

export async function cacheClear(prefix: string) {
  for (const k of await cacheKeys(prefix)) await cacheDelete(k)
}

/** Hash FNV-1a corto para claves de caché. */
export function hashKey(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
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
