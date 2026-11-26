import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_POLICIES,
  cacheGet,
  cacheKeys,
  cacheSet,
  MEMORY_MAX_ENTRIES,
  purgeCache,
  setCacheBackendForTests,
  type KVBackend,
} from '@/utils/storage'

/** Almacén en memoria que imita IndexedDB (y cuenta lo que guarda). */
function fakeBackend() {
  const data = new Map<string, unknown>()
  const b: KVBackend & { data: Map<string, unknown> } = {
    data,
    get: async <T,>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
    del: async (k) => void data.delete(k),
    keys: async () => [...data.keys()],
  }
  return b
}

const overpass = CACHE_POLICIES.find((p) => p.prefix === 'overpass:')!
const original = { ...overpass }

describe('caché persistente', () => {
  let backend: ReturnType<typeof fakeBackend>
  beforeEach(() => {
    backend = fakeBackend()
    setCacheBackendForTests(backend)
  })
  afterEach(() => {
    Object.assign(overpass, original)
    vi.useRealTimers()
  })

  it('guarda una sola copia: con IndexedDB no queda duplicado en memoria', async () => {
    await cacheSet('overpass:v2:a', { elements: [1, 2, 3] })
    expect(await cacheGet('overpass:v2:a')).toEqual({ elements: [1, 2, 3] })
    // Si se borra del almacén, no reaparece desde una copia en memoria.
    backend.data.delete('overpass:v2:a')
    expect(await cacheGet('overpass:v2:a')).toBeUndefined()
  })

  it('respeta el límite de entradas: se borran las más antiguas', async () => {
    overpass.maxEntries = 3
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(1_000_000 + i * 1000)
      await cacheSet(`overpass:v2:q${i}`, { i })
    }
    expect((await cacheKeys('overpass:')).sort()).toEqual(['overpass:v2:q3', 'overpass:v2:q4', 'overpass:v2:q5'])
  })

  it('respeta el límite de tamaño', async () => {
    overpass.maxBytes = 2_500
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(2_000_000 + i * 1000)
      await cacheSet(`overpass:v2:t${i}`, { i }, { size: 1_000 })
    }
    expect((await cacheKeys('overpass:')).sort()).toEqual(['overpass:v2:t3', 'overpass:v2:t4'])
  })

  it('al arrancar borra lo caducado y las claves antiguas sin índice, pero nunca los mapas del usuario', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(10_000_000)
    await cacheSet('overpass:v2:vieja', { x: 1 })
    await cacheSet('custom-map:cm_1', { name: 'Mi mapa' })
    // Clave de una versión anterior (hash de 32 bits), sin índice.
    backend.data.set('overpass:1abc', { savedAt: 10_000_000, value: {} })
    vi.setSystemTime(10_000_000 + overpass.ttlMs - 1000)
    await cacheSet('overpass:v2:reciente', { x: 2 })

    vi.setSystemTime(10_000_000 + overpass.ttlMs + 1000)
    await purgeCache()
    expect((await cacheKeys('')).sort()).toEqual(['custom-map:cm_1', 'overpass:v2:reciente'])
  })

  it('lo caducado no se devuelve y se borra al leerlo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(50_000_000)
    await cacheSet('overpass:v2:z', { z: 1 })
    vi.setSystemTime(50_000_000 + overpass.ttlMs + 1)
    expect(await cacheGet('overpass:v2:z')).toBeUndefined()
    await vi.waitFor(async () => expect(backend.data.has('overpass:v2:z')).toBe(false))
  })

  it('sin IndexedDB usa memoria, pero acotada', async () => {
    setCacheBackendForTests(null)
    for (let i = 0; i < MEMORY_MAX_ENTRIES + 25; i++) await cacheSet(`overpass:v2:m${i}`, { i })
    expect(await cacheKeys('overpass:')).toHaveLength(MEMORY_MAX_ENTRIES)
    expect(await cacheGet(`overpass:v2:m${MEMORY_MAX_ENTRIES + 24}`)).toEqual({ i: MEMORY_MAX_ENTRIES + 24 })
    expect(await cacheGet('overpass:v2:m0')).toBeUndefined()
  })
})
