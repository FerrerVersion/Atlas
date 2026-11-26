import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateLimitedClient } from '@/utils/http'

afterEach(() => vi.unstubAllGlobals())

describe('RateLimitedClient', () => {
  it('espacia el inicio de las peticiones según la política del servicio', async () => {
    const starts: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => {
      starts.push(Date.now())
      return new Response('{}', { status: 200 })
    }))
    const client = new RateLimitedClient(150)
    await Promise.all([1, 2, 3].map((i) => client.request(`https://example.org/${i}`)))
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(140)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(140)
  })

  it('una respuesta lenta no bloquea las siguientes y caduca con timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) =>
      url.endsWith('slow')
        ? new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('t', 'TimeoutError'))))
        : Promise.resolve(new Response('{"ok":1}', { status: 200 })),
    ))
    const client = new RateLimitedClient(10, 300)
    const slow = client.request('https://example.org/slow')
    await expect(client.request('https://example.org/fast')).resolves.toEqual({ ok: 1 })
    await expect(slow).rejects.toMatchObject({ status: 408 })
  })
})

describe('formato de duración', async () => {
  const { formatDuration } = await import('@/utils/distance')
  it('0 s es «0 min», no «1 min»', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(20)).toBe('1 min')
    expect(formatDuration(3720)).toBe('1 h 2 min')
  })
})
