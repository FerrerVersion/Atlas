import { useSyncExternalStore } from 'react'
import type { OsmWay } from '@/features/routing/graph'
import { haversine, type LatLngTuple } from '@/utils/distance'
import { bboxAround } from '@/utils/geometry'
import { isAbortError } from '@/utils/http'
import { onBackgroundPause, whenBackgroundAllowed } from './backgroundGate'
import { networkStore } from './networkStore'
import { queryOverpass } from './overpassService'

/**
 * Corredor de la ruta: cuando la ruta ya está calculada, se cargan las carreteras
 * reales en 5 km a su alrededor (para ver el entorno del trayecto y tener alternativas
 * si hay que recalcular). Va en segundo plano y por tramos, del inicio al final.
 */
export const CORRIDOR_RADIUS_M = 5_000
/** Separación entre puntos de la línea simplificada que se envía a Overpass. */
export const CORRIDOR_STEP_M = 1_500
/** Longitud de ruta que cubre cada consulta. */
export const CORRIDOR_CHUNK_M = 40_000
export const CORRIDOR_TYPES =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified'

/** Puntos de la ruta separados al menos `step` metros (siempre incluye el primero y el último). */
export function sampleRoute(geometry: readonly LatLngTuple[], step = CORRIDOR_STEP_M): LatLngTuple[] {
  if (geometry.length === 0) return []
  const out: LatLngTuple[] = [geometry[0]]
  let last = geometry[0]
  for (let i = 1; i < geometry.length; i++) {
    const p = geometry[i]
    if (haversine(last[0], last[1], p[0], p[1]) >= step) {
      out.push(p)
      last = p
    }
  }
  const end = geometry[geometry.length - 1]
  if (out[out.length - 1] !== end) out.push(end)
  return out
}

/** Tramos consecutivos (cada uno empieza donde acaba el anterior) de ~`chunk` metros. */
export function chunkSamples(samples: LatLngTuple[], chunk = CORRIDOR_CHUNK_M): LatLngTuple[][] {
  const out: LatLngTuple[][] = []
  let cur: LatLngTuple[] = []
  let len = 0
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]
    if (cur.length > 0) len += haversine(cur[cur.length - 1][0], cur[cur.length - 1][1], p[0], p[1])
    cur.push(p)
    if (len >= chunk && i < samples.length - 1) {
      out.push(cur)
      cur = [p]
      len = 0
    }
  }
  // Tras un corte `cur` ya lleva al menos dos puntos (el compartido y los siguientes).
  if (cur.length >= 2 || out.length === 0) out.push(cur)
  return out
}

/** Consulta Overpass: vías a ≤ 5 km de la polilínea (filtro `around` con varios puntos). */
export function corridorQuery(points: LatLngTuple[], radius = CORRIDOR_RADIUS_M): string {
  const coords = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  return `[out:json][timeout:90];way["highway"~"^(${CORRIDOR_TYPES})$"](around:${radius},${coords});out body geom qt;`
}

/** Rectángulos de 5 km alrededor de cada punto (para elegir teselas). */
export const corridorBoxes = (samples: LatLngTuple[], radius = CORRIDOR_RADIUS_M) =>
  samples.map(([lat, lng]) => bboxAround(lat, lng, radius))

export interface CorridorProgress {
  total: number
  done: number
  running: boolean
}
let progress: CorridorProgress = { total: 0, done: 0, running: false }
const listeners = new Set<() => void>()
export function setCorridorProgress(p: Partial<CorridorProgress>) {
  progress = { ...progress, ...p }
  listeners.forEach((l) => l())
}
export const useCorridorProgress = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => progress,
    () => progress,
  )

/** Descarga las vías del corredor tramo a tramo y las añade a la red cargada. */
export async function loadCorridorRoads(geometry: readonly LatLngTuple[], signal: AbortSignal, onChunk?: () => void) {
  const chunks = chunkSamples(sampleRoute(geometry))
  for (const chunk of chunks) {
    for (;;) {
      await whenBackgroundAllowed(signal)
      const ctrl = new AbortController()
      const stop = () => ctrl.abort()
      signal.addEventListener('abort', stop, { once: true })
      const off = onBackgroundPause(stop)
      try {
        const res = await queryOverpass<OsmWay>(corridorQuery(chunk), ctrl.signal, undefined, undefined, {
          background: true,
          timeoutMs: 90_000,
        })
        networkStore.addWays(
          res.elements.filter((e) => e.type === 'way' && Array.isArray(e.geometry) && Array.isArray(e.nodes)),
        )
        break
      } catch (e) {
        signal.throwIfAborted()
        if (isAbortError(e)) continue // en pausa por otra ruta: se repite el tramo
        break // un tramo que falla no impide los demás
      } finally {
        off()
        signal.removeEventListener('abort', stop)
      }
    }
    onChunk?.()
  }
  return chunks.length
}
