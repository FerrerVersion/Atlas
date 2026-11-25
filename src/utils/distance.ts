/** Radio medio de la Tierra en metros (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8

export type LatLngTuple = [lat: number, lng: number]

export interface LatLng {
  lat: number
  lng: number
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Distancia ortodrómica (haversine) en metros. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

export const distanceBetween = (a: LatLng, b: LatLng) => haversine(a.lat, a.lng, b.lat, b.lng)

/** Longitud de una polilínea [lat, lng][] en metros. */
export function polylineLength(points: readonly LatLngTuple[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
  }
  return total
}

/** Rumbo inicial de a hacia b en grados [0, 360). 0 = norte, 90 = este. */
export function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = toRad(aLat)
  const φ2 = toRad(bLat)
  const Δλ = toRad(bLng - aLng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Diferencia de rumbo normalizada a (-180, 180]. Positivo = giro a la derecha. */
export function turnAngle(inBearing: number, outBearing: number): number {
  let d = outBearing - inBearing
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}

/** Velocidad (km/h) y distancia (m) → segundos. */
export const travelSeconds = (meters: number, kmh: number) => (kmh > 0 ? meters / (kmh / 3.6) : Infinity)

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.round(meters / 5) * 5 : Math.round(meters / 10) * 10
    return `${rounded} m`
  }
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const totalMin = Math.max(1, Math.round(seconds / 60))
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
