import { bboxOf, type BBox } from '@/utils/geometry'
import { cellsForBBox, networkStore } from './networkStore'
import { fetchRoadNetwork } from './overpassService'

/**
 * Carga de calles por CELDAS de una rejilla fija (~1,6 km). La comparten la carga
 * automática al acercarse, la precarga de paradas y el cálculo de rutas: una celda
 * ya cargada (o en camino) nunca se vuelve a pedir.
 */
const pending = new Map<string, Promise<void>>()

/** Lado máximo (en celdas) de un bloque que se pide en una sola consulta (6×6 ≈ 10 × 8 km). */
export const BLOCK_CELLS = 6

export interface EnsureOptions {
  /**
   * Máximo de celdas por llamada. La carga automática del mapa limita (se cargan
   * primero las del centro de la zona); el cálculo de rutas no limita (Infinity).
   */
  maxCells?: number
  signal?: AbortSignal
  onRetry?: (host: string) => void
}

type Cell = ReturnType<typeof cellsForBBox>[number]

/** Celdas únicas de varias zonas, ordenadas de la más cercana al centro a la más lejana. */
export function cellsForAreas(areas: BBox[]): Cell[] {
  const unique = new Map<string, Cell>()
  for (const a of areas) for (const c of cellsForBBox(a)) unique.set(c.key, c)
  const all = bboxOf(areas.flatMap((a) => [{ lat: a.south, lng: a.west }, { lat: a.north, lng: a.east }]))
  const cLat = (all.south + all.north) / 2
  const cLng = (all.west + all.east) / 2
  const d = (c: Cell) => ((c.bbox.south + c.bbox.north) / 2 - cLat) ** 2 + ((c.bbox.west + c.bbox.east) / 2 - cLng) ** 2
  return [...unique.values()].sort((a, b) => d(a) - d(b))
}

/**
 * Agrupa celdas en bloques que caben en BLOCK_CELLS × BLOCK_CELLS (una consulta por
 * bloque). Los bloques no van alineados a la rejilla: una zona pequeña es siempre una
 * sola consulta, y una grande o alargada (un tramo a pie) se reparte en varias.
 */
export function groupIntoBlocks(cells: Cell[]): Cell[][] {
  const blocks: { cells: Cell[]; i0: number; i1: number; j0: number; j1: number }[] = []
  for (const c of cells) {
    const [i, j] = c.key.split(':').map(Number)
    const fits = blocks.find(
      (b) =>
        Math.max(b.i1, i) - Math.min(b.i0, i) < BLOCK_CELLS && Math.max(b.j1, j) - Math.min(b.j0, j) < BLOCK_CELLS,
    )
    if (fits) {
      fits.cells.push(c)
      fits.i0 = Math.min(fits.i0, i)
      fits.i1 = Math.max(fits.i1, i)
      fits.j0 = Math.min(fits.j0, j)
      fits.j1 = Math.max(fits.j1, j)
    } else blocks.push({ cells: [c], i0: i, i1: i, j0: j, j1: j })
  }
  return blocks.map((b) => b.cells)
}

/**
 * Garantiza que las calles de la zona (o zonas) están cargadas. Devuelve cuántas vías
 * se añadieron. Las celdas que faltan se piden por bloques: nunca se recortan en
 * silencio (antes, una zona grande se quedaba solo con las 36 primeras celdas).
 */
export async function ensureRoadCells(area: BBox | BBox[], opts: EnsureOptions = {}): Promise<number> {
  const cells = cellsForAreas(Array.isArray(area) ? area : [area]).slice(0, opts.maxCells ?? 9)
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
  for (const block of groupIntoBlocks(missing)) {
    const corners = block.flatMap((c) => [
      { lat: c.bbox.south, lng: c.bbox.west },
      { lat: c.bbox.north, lng: c.bbox.east },
    ])
    // La descarga compartida no se cancela si un interesado se va (otro puede necesitarla).
    const job = fetchRoadNetwork({ detail: [bboxOf(corners)] }, undefined, opts.onRetry).then((ways) => {
      added += networkStore.addWays(ways)
      networkStore.markCells(block.map((c) => c.key))
      networkStore.addCoverage(block.map((c) => c.bbox))
    })
    const tracked = job.finally(() => block.forEach((c) => pending.delete(c.key)))
    block.forEach((c) => pending.set(c.key, tracked))
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
