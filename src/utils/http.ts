/**
 * Cliente HTTP con limitación de frecuencia por servicio. Las peticiones se
 * encolan para respetar las políticas de uso de los servicios públicos de OSM
 * (p. ej. Nominatim: máximo 1 petición por segundo).
 */
export class RateLimitedClient {
  private last = 0
  private chain: Promise<unknown> = Promise.resolve()
  private readonly minIntervalMs: number

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs
  }

  async request<T>(input: string, init: RequestInit = {}): Promise<T> {
    const run = async () => {
      const wait = this.last + this.minIntervalMs - Date.now()
      if (wait > 0) await sleep(wait, init.signal ?? undefined)
      init.signal?.throwIfAborted()
      this.last = Date.now()
      const res = await fetch(input, init)
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} en ${new URL(input).host}`)
      return (await res.json()) as T
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export const isAbortError = (e: unknown) =>
  e instanceof DOMException ? e.name === 'AbortError' : (e as { name?: string })?.name === 'AbortError'
