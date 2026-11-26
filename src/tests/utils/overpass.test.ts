import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/http', async (orig) => ({
  ...(await orig<typeof import('@/utils/http')>()),
  sleep: () => Promise.resolve(),
}))

const { queryOverpass } = await import('@/features/osm/overpassService')

afterEach(() => vi.unstubAllGlobals())

describe('queryOverpass', () => {
  it('reintenta un servidor que devolvió 504 y no repite los que fallaron por red', async () => {
    const hits: string[] = []
    let mailHits = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const host = new URL(url).host
      hits.push(host)
      if (host === 'maps.mail.ru') return ++mailHits === 1 ? new Response('busy', { status: 504 }) : Response.json({ elements: [{ id: 1 }] })
      if (host === 'overpass-api.de') return new Response('bad gateway', { status: 502 })
      throw new TypeError('network error')
    }))
    const res = await queryOverpass<{ id: number }>(`[out:json];way(${Math.random()});out;`)
    expect(res.elements).toEqual([{ id: 1 }])
    expect(hits.filter((h) => h === 'overpass.private.coffee')).toHaveLength(1)
    expect(hits.filter((h) => h === 'maps.mail.ru')).toHaveLength(2)
  })
})

describe('consulta escalonada', () => {
  it('si un espejo se cuelga, lanza el siguiente y usa el primero que responde', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const aborted: string[] = []
    const hosts: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      const host = new URL(url).host
      hosts.push(host)
      if (hosts.length === 1) {
        return new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () => {
            aborted.push(host)
            reject(new DOMException('aborted', 'AbortError'))
          }),
        )
      }
      return Promise.resolve(Response.json({ elements: [{ id: 2 }] }))
    }))
    const p = queryOverpass<{ id: number }>(`[out:json];way(${Math.random()});out;`)
    await vi.advanceTimersByTimeAsync(13_000)
    await expect(p).resolves.toMatchObject({ elements: [{ id: 2 }] })
    expect(hosts).toHaveLength(2)
    expect(aborted).toEqual([hosts[0]])
    vi.useRealTimers()
  })
})
