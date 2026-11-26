/**
 * Cliente HTTP con limitación de frecuencia por servicio. Las peticiones se
 * encolan para respetar las políticas de uso de los servicios públicos de OSM
 * (p. ej. Nominatim: máximo 1 petición por segundo).
 */
export class RateLimitedClient {
  /** Próximo instante en que puede empezar una petición. */
  private nextSlot = 0
  private readonly minIntervalMs: number
  private readonly timeoutMs: number

  constructor(minIntervalMs: number, timeoutMs = 20_000) {
    this.minIntervalMs = minIntervalMs
    this.timeoutMs = timeoutMs
  }

  /**
   * Espacia el INICIO de las peticiones (no las serializa): una respuesta lenta
   * no bloquea a las siguientes. Cada petición tiene un tiempo máximo.
   */
  async request<T>(input: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<T> {
    const now = Date.now()
    const start = Math.max(now, this.nextSlot)
    this.nextSlot = start + this.minIntervalMs
    if (start > now) await sleep(start - now, init.signal ?? undefined)
    init.signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    let res: Response
    try {
      res = await fetch(input, { ...init, signal })
    } catch (e) {
      if (timeout.aborted && !init.signal?.aborted) throw new HttpError(408, `Tiempo de espera agotado en ${new URL(input).host}`)
      throw e
    }
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} en ${new URL(input).host}`)
    return (await res.json()) as T
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
