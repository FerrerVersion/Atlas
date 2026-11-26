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
    await vi.advanceTimersByTimeAsync(7_000)
    await expect(p).resolves.toMatchObject({ elements: [{ id: 2 }] })
    expect(hosts).toHaveLength(2)
    expect(aborted).toEqual([hosts[0]])
    vi.useRealTimers()
  })
})

describe('consultas repetidas en curso', () => {
  // Módulo nuevo en cada test: el limitador no arrastra el reloj simulado de otros tests.
  const fresh = async () => {
    vi.resetModules()
    return (await import('@/features/osm/overpassService')).queryOverpass
  }
  it('dos peticiones iguales simultáneas (precarga + ruta) hacen una sola descarga', async () => {
    let hits = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      hits++
      await new Promise((r) => setTimeout(r, 20))
      return Response.json({ elements: [{ id: 9 }] })
    }))
    const ql = `[out:json];way(${Math.random()});out;`
    const query = await fresh()
    const [a, b] = await Promise.all([query(ql), query(ql)])
    expect(a).toEqual(b)
    expect(hits).toBe(1)
  })

  it('cancelar a un interesado no cancela la descarga compartida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return Response.json({ elements: [{ id: 10 }] })
    }))
    const ql = `[out:json];way(${Math.random()});out;`
    const ctrl = new AbortController()
    const query = await fresh()
    const first = query(ql, ctrl.signal)
    const second = query(ql)
    ctrl.abort()
    await expect(first).rejects.toThrow()
    await expect(second).resolves.toMatchObject({ elements: [{ id: 10 }] })
  })
})

describe('servidor preferido', () => {
  it('se recuerda entre visitas el último espejo que respondió', async () => {
    localStorage.removeItem('atlas-nav:overpass-preferido')
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new URL(url).host === 'maps.mail.ru' ? Response.json({ elements: [] }) : new Response('caído', { status: 503 }),
    ))
    vi.resetModules()
    const { queryOverpass: q1, OVERPASS_ENDPOINTS } = await import('@/features/osm/overpassService')
    await q1(`[out:json];way(${Math.random()});out;`)
    const saved = localStorage.getItem('atlas-nav:overpass-preferido')
    expect(saved).toContain('maps.mail.ru')
    // «Nueva visita»: el primer intento va directo al espejo recordado.
    const hits: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      hits.push(new URL(url).host)
      return Response.json({ elements: [] })
    }))
    vi.resetModules()
    const { queryOverpass: q2 } = await import('@/features/osm/overpassService')
    await q2(`[out:json];way(${Math.random()});out;`)
    expect(hits[0]).toBe('maps.mail.ru')
    expect(OVERPASS_ENDPOINTS.length).toBeGreaterThan(1)
  })
})
