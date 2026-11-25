import { geocoding, type Place } from './geocodingService'

/**
 * Crea un lugar a partir de un punto del mapa. Intenta obtener el nombre REAL
 * con geocodificación inversa (Nominatim); si falla, usa solo las coordenadas.
 */
export async function placeFromMap(lat: number, lng: number): Promise<Place> {
  const fallback: Place = {
    id: `map:${lat.toFixed(6)},${lng.toFixed(6)}`,
    name: `Punto ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    kind: 'coordinates',
    kindLabel: 'Punto del mapa',
    lat,
    lng,
    source: 'map',
  }
  try {
    const found = await geocoding.reverseProvider.reverse?.(lat, lng)
    if (!found) return fallback
    // Conserva la posición exacta elegida y usa el nombre real devuelto por OSM.
    return { ...found, id: fallback.id, lat, lng, source: 'map', bbox: undefined, address: found.address }
  } catch {
    return fallback
  }
}
