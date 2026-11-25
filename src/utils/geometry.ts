import { bearing, haversine, type LatLngTuple } from './distance'

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export function bboxOf(points: readonly { lat: number; lng: number }[]): BBox {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const p of points) {
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
  }
  return { south, west, north, east }
}

/** Expande un bbox una distancia en metros por cada lado. */
export function expandBBox(b: BBox, meters: number): BBox {
  const dLat = meters / 111_320
  const midLat = (b.south + b.north) / 2
  const dLng = meters / (111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)))
  return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLng, east: b.east + dLng }
}

export const bboxAround = (lat: number, lng: number, radiusMeters: number): BBox =>
  expandBBox({ south: lat, north: lat, west: lng, east: lng }, radiusMeters)

export const bboxDiagonal = (b: BBox) => haversine(b.south, b.west, b.north, b.east)

export const bboxContains = (b: BBox, lat: number, lng: number) =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east

export const bboxIntersects = (a: BBox, b: BBox) =>
  a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west

/** Formato Overpass: (sur,oeste,norte,este). */
export const bboxToOverpass = (b: BBox) =>
  [b.south, b.west, b.north, b.east].map((n) => n.toFixed(5)).join(',')

/**
 * Proyección del punto p sobre el segmento a-b en un plano equirectangular local.
 * Devuelve el parámetro t∈[0,1] y la distancia en metros.
 */
export function projectOnSegment(p: LatLngTuple, a: LatLngTuple, b: LatLngTuple) {
  const k = Math.cos((p[0] * Math.PI) / 180)
  const ax = a[1] * k
  const ay = a[0]
  const bx = b[1] * k
  const by = b[0]
  const px = p[1] * k
  const py = p[0]
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const point: LatLngTuple = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  return { t, point, distance: haversine(p[0], p[1], point[0], point[1]) }
}

/**
 * Punto situado a `meters` metros a lo largo de la polilínea (recortado a los extremos).
 */
export function pointAlong(points: readonly LatLngTuple[], meters: number): LatLngTuple {
  if (points.length === 0) throw new Error('Polilínea vacía')
  if (meters <= 0) return points[0]
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    if (acc + seg >= meters) {
      const t = seg === 0 ? 0 : (meters - acc) / seg
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ]
    }
    acc += seg
  }
  return points[points.length - 1]
}

/**
 * Rumbo representativo al salir del inicio de una polilínea, mirando a `lookahead` metros
 * para que pequeños quiebros de la geometría no distorsionen el ángulo.
 */
export function startBearing(points: readonly LatLngTuple[], lookahead = 20): number {
  const target = pointAlong(points, lookahead)
  return bearing(points[0][0], points[0][1], target[0], target[1])
}

/** Rumbo representativo al llegar al final de una polilínea. */
export function endBearing(points: readonly LatLngTuple[], lookback = 20): number {
  const reversed = [...points].reverse()
  const from = pointAlong(reversed, lookback)
  const end = points[points.length - 1]
  return bearing(from[0], from[1], end[0], end[1])
}

/** Concatena polilíneas evitando duplicar el punto de unión. */
export function concatPolylines(parts: readonly (readonly LatLngTuple[])[]): LatLngTuple[] {
  const out: LatLngTuple[] = []
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1]
      if (last && last[0] === p[0] && last[1] === p[1]) continue
      out.push(p)
    }
  }
  return out
}

/**
 * Localiza el punto más cercano de una polilínea a p y devuelve la distancia
 * recorrida desde el inicio hasta ese punto (útil para seguimiento GPS).
 */
export function locateOnPolyline(points: readonly LatLngTuple[], p: LatLngTuple) {
  let best = { offset: 0, distance: Infinity, point: points[0] ?? p }
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    const proj = projectOnSegment(p, points[i - 1], points[i])
    if (proj.distance < best.distance) {
      best = { offset: acc + seg * proj.t, distance: proj.distance, point: proj.point }
    }
    acc += seg
  }
  return best
}

/** Tramo inicial de la polilínea hasta `meters` metros (incluye el punto interpolado). */
export function sliceAlong(points: readonly LatLngTuple[], meters: number): LatLngTuple[] {
  if (points.length === 0) return []
  const out: LatLngTuple[] = [points[0]]
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    if (acc + seg >= meters) {
      const t = seg === 0 ? 0 : (meters - acc) / seg
      out.push([
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ])
      return out
    }
    acc += seg
    out.push(points[i])
  }
  return out
}
