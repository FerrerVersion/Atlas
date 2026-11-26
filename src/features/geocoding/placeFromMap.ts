import { geocoding, type Place } from './geocodingService'

/** Lugar inmediato con solo las coordenadas (no espera a ningún servidor). */
export function pointPlace(lat: number, lng: number): Place {
  return {
    id: `map:${lat.toFixed(6)},${lng.toFixed(6)}`,
    name: `Punto ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    kind: 'coordinates',
    kindLabel: 'Punto del mapa',
    lat,
    lng,
    source: 'map',
  }
}

/**
 * Nombre REAL del punto con geocodificación inversa (Nominatim). Conserva el id y la
 * posición exacta del punto; si no hay nombre, devuelve el lugar con coordenadas.
 */
export async function placeFromMap(lat: number, lng: number): Promise<Place> {
  const fallback = pointPlace(lat, lng)
  try {
    const found = await geocoding.reverseProvider.reverse?.(lat, lng)
    if (!found) return fallback
    return { ...found, id: fallback.id, lat, lng, source: 'map', bbox: undefined, address: found.address }
  } catch {
    return fallback
  }
}
