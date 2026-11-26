import { bboxOf, type BBox } from '@/utils/geometry'
import { cellsForBBox, networkStore } from './networkStore'
import { fetchRoadNetwork } from './overpassService'

/**
 * Carga de calles por CELDAS de una rejilla fija (~1,6 km). La comparten la carga
 * automática al acercarse, la precarga de paradas y el cálculo de rutas: una celda
 * ya cargada (o en camino) nunca se vuelve a pedir.
 */
const pending = new Map<string, Promise<void>>()

export interface EnsureOptions {
  /** Máximo de celdas por llamada (la carga automática limita; las rutas permiten más). */
  maxCells?: number
  signal?: AbortSignal
  onRetry?: (host: string) => void
}

/** Garantiza que las calles de la zona están cargadas. Devuelve cuántas vías se añadieron. */
export async function ensureRoadCells(area: BBox, opts: EnsureOptions = {}): Promise<number> {
  const cells = cellsForBBox(area).slice(0, opts.maxCells ?? 9)
  const waiting: Promise<void>[] = []
  const missing = cells.filter((c) => {
    if (networkStore.hasCell(c.key)) return false
    const p = pending.get(c.key)
    if (p) {
      waiting.push(p)
      return false
    }
    return true
  })

  let added = 0
  if (missing.length > 0) {
    const corners = missing.flatMap((c) => [
      { lat: c.bbox.south, lng: c.bbox.west },
      { lat: c.bbox.north, lng: c.bbox.east },
    ])
    // La descarga compartida no se cancela si un interesado se va (otro puede necesitarla).
    const job = fetchRoadNetwork({ detail: [bboxOf(corners)] }, undefined, opts.onRetry).then((ways) => {
      added = networkStore.addWays(ways)
      networkStore.markCells(missing.map((c) => c.key))
      networkStore.addCoverage(missing.map((c) => c.bbox))
    })
    const tracked = job.finally(() => missing.forEach((c) => pending.delete(c.key)))
    missing.forEach((c) => pending.set(c.key, tracked))
    waiting.push(tracked)
  }

  const all = Promise.all(waiting)
  if (opts.signal) {
    opts.signal.throwIfAborted()
    await Promise.race([
      all,
      new Promise((_, reject) =>
        opts.signal!.addEventListener('abort', () => reject(opts.signal!.reason ?? new DOMException('Aborted', 'AbortError')), {
          once: true,
        }),
      ),
    ])
  } else await all
  return added
}
