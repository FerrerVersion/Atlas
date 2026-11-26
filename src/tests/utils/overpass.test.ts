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

describe('servidores saturados', () => {
  it('reintenta hasta dos rondas solo los que respondieron 429/5xx, nunca los colgados', async () => {
    const hits: Record<string, number> = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const host = new URL(url).host
      hits[host] = (hits[host] ?? 0) + 1
      if (host === 'overpass-api.de') return hits[host] < 3 ? new Response('busy', { status: 502 }) : Response.json({ elements: [{ id: 3 }] })
      if (host === 'maps.mail.ru') return new Response('busy', { status: 504 })
      throw new TypeError('network error')
    }))
    const res = await queryOverpass<{ id: number }>(`[out:json];way(${Math.random()});out;`)
    expect(res.elements).toEqual([{ id: 3 }])
    // 1.ª pasada (3 espejos) + 1.ª ronda (502 y 504 otra vez) + 2.ª ronda (overpass-api.de responde).
    expect(hits['overpass-api.de']).toBe(3)
    expect(hits['overpass.private.coffee']).toBe(1)
  })
})

describe('espejos de uno en uno', () => {
  it('si un espejo falla por tiempo antes del respaldo, pasa al siguiente (nunca dos a la vez)', async () => {
    const hosts: string[] = []
    const aborted: string[] = []
    let active = 0
    let maxActive = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      const host = new URL(url).host
      hosts.push(host)
      active++
      maxActive = Math.max(maxActive, active)
      if (hosts.length === 1) {
        return new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () => {
            active--
            aborted.push(host)
            reject(new DOMException('timeout', 'TimeoutError'))
          }),
        )
      }
      active--
      return Promise.resolve(Response.json({ elements: [{ id: 2 }] }))
    }))
    // Tiempo máximo por espejo reducido para el test (en la app son 25 s, y el respaldo, 15 s).
    const res = await queryOverpass<{ id: number }>(`[out:json];way(${Math.random()});out;`, undefined, undefined, 80, 10_000)
    expect(res.elements).toEqual([{ id: 2 }])
    expect(hosts).toHaveLength(2)
    expect(aborted).toEqual([hosts[0]])
    expect(maxActive).toBe(1)
  })

  it('si un espejo tarda más que el plazo del respaldo, lanza UN respaldo y gana el primero que responde', async () => {
    const hosts: string[] = []
    const aborted: string[] = []
    let active = 0
    let maxActive = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      const host = new URL(url).host
      hosts.push(host)
      active++
      maxActive = Math.max(maxActive, active)
      // Ninguno responde nunca salvo el segundo, que tarda 30 ms.
      let done = false
      return new Promise((resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          if (done) return
          done = true
          active--
          aborted.push(host)
          reject(new DOMException('aborted', 'AbortError'))
        })
        if (hosts.length === 2) setTimeout(() => (done = true, active--, resolve(Response.json({ elements: [{ id: 7 }] }))), 30)
      })
    }))
    const res = await queryOverpass<{ id: number }>(`[out:json];way(${Math.random()});out;`, undefined, undefined, 5_000, 40)
    expect(res.elements).toEqual([{ id: 7 }])
    // El primero se cancela al ganar el respaldo; el tercero nunca se usa.
    expect(hosts).toHaveLength(2)
    expect(aborted).toEqual([hosts[0]])
    expect(maxActive).toBe(2)
  })

  it('los fallos rápidos (502) no lanzan respaldos en paralelo: se pasa al siguiente', async () => {
    let active = 0
    let maxActive = 0
    const hosts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      hosts.push(new URL(url).host)
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return hosts.length === 1 ? new Response('bad gateway', { status: 502 }) : Response.json({ elements: [] })
    }))
    await queryOverpass(`[out:json];way(${Math.random()});out;`, undefined, undefined, 5_000, 1_000)
    expect(hosts).toHaveLength(2)
    expect(maxActive).toBe(1)
  })

  it('una consulta que responde a la primera no toca los demás espejos', async () => {
    const hosts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      hosts.push(new URL(url).host)
      return Response.json({ elements: [] })
    }))
    await queryOverpass(`[out:json];way(${Math.random()});out;`)
    expect(hosts).toHaveLength(1)
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

describe('límite de consultas simultáneas', () => {
  it('nunca hay más de 2 consultas reales a la vez', async () => {
    let now = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      now++
      peak = Math.max(peak, now)
      await new Promise((r) => setTimeout(r, 15))
      now--
      return Response.json({ elements: [] })
    }))
    vi.resetModules()
    const { queryOverpass } = await import('@/features/osm/overpassService')
    await Promise.all(Array.from({ length: 6 }, (_, i) => queryOverpass(`[out:json];way(${i},${Math.random()});out;`)))
    expect(peak).toBeLessThanOrEqual(2)
  })
})
