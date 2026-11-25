import { RateLimitedClient } from '@/utils/http'
import type { BBox } from '@/utils/geometry'

/**
 * Geocodificación con proveedores intercambiables basados en OpenStreetMap.
 *
 * - Photon (komoot): pensado para autocompletado ("search-as-you-type").
 * - Nominatim (OSMF): búsqueda explícita y geocodificación inversa. Su política
 *   prohíbe el autocompletado en cliente, por eso solo se llama al confirmar.
 *
 * URLs configurables con VITE_PHOTON_URL y VITE_NOMINATIM_URL.
 */
export type PlaceKind =
  | 'country'
  | 'region'
  | 'city'
  | 'town'
  | 'village'
  | 'suburb'
  | 'street'
  | 'address'
  | 'poi'
  | 'category'
  | 'coordinates'
  | 'other'

export interface Place {
  id: string
  /** Nombre real procedente de OSM. */
  name: string
  kind: PlaceKind
  kindLabel: string
  address?: string
  lat: number
  lng: number
  bbox?: BBox
  source: 'photon' | 'nominatim' | 'local' | 'overpass' | 'gps' | 'map' | 'custom'
  osm?: { type: string; id: number }
  distanceMeters?: number
  category?: string
}

export interface GeocodingProvider {
  id: string
  name: string
  autocomplete?: (q: string, opts: { near?: { lat: number; lng: number }; signal?: AbortSignal }) => Promise<Place[]>
  search: (q: string, opts: { near?: { lat: number; lng: number }; signal?: AbortSignal }) => Promise<Place[]>
  reverse?: (lat: number, lng: number, opts?: { signal?: AbortSignal; zoom?: number }) => Promise<Place | null>
}

const PHOTON_URL = (import.meta.env.VITE_PHOTON_URL as string | undefined) ?? 'https://photon.komoot.io'
const NOMINATIM_URL = (import.meta.env.VITE_NOMINATIM_URL as string | undefined) ?? 'https://nominatim.openstreetmap.org'

/* ------------------------------- Clasificación ------------------------------ */

const KIND_LABELS: Record<PlaceKind, string> = {
  country: 'País',
  region: 'Región',
  city: 'Ciudad',
  town: 'Municipio',
  village: 'Localidad',
  suburb: 'Barrio',
  street: 'Calle',
  address: 'Dirección',
  poi: 'Lugar',
  category: 'Categoría',
  coordinates: 'Coordenadas',
  other: 'Lugar',
}

export function kindFromOsm(key: string | undefined, value: string | undefined, type?: string): PlaceKind {
  const v = value ?? ''
  if (key === 'place') {
    if (v === 'country') return 'country'
    if (['state', 'region', 'province', 'county'].includes(v)) return 'region'
    if (v === 'city') return 'city'
    if (['town', 'municipality'].includes(v)) return 'town'
    if (['village', 'hamlet', 'locality', 'isolated_dwelling'].includes(v)) return 'village'
    if (['suburb', 'neighbourhood', 'quarter', 'city_block', 'borough'].includes(v)) return 'suburb'
  }
  if (key === 'boundary' && v === 'administrative') {
    if (type === 'city') return 'city'
    if (type === 'state' || type === 'county') return 'region'
    if (type === 'country') return 'country'
    if (type === 'district') return 'suburb'
    return 'town'
  }
  if (key === 'highway') return 'street'
  if (key === 'building' || type === 'house') return 'address'
  if (['amenity', 'shop', 'tourism', 'historic', 'leisure', 'aeroway', 'office', 'railway', 'craft'].includes(key ?? '')) {
    return 'poi'
  }
  if (type === 'street') return 'street'
  if (type === 'city') return 'city'
  if (type === 'district' || type === 'locality') return 'suburb'
  return 'other'
}

const OSM_VALUE_LABELS: Record<string, string> = {
  fuel: 'Gasolinera', restaurant: 'Restaurante', cafe: 'Cafetería', bar: 'Bar', parking: 'Aparcamiento',
  hospital: 'Hospital', clinic: 'Centro de salud', police: 'Policía', pharmacy: 'Farmacia',
  supermarket: 'Supermercado', museum: 'Museo', attraction: 'Atracción', aerodrome: 'Aeropuerto',
  station: 'Estación', school: 'Centro educativo', university: 'Universidad', hotel: 'Hotel',
  castle: 'Castillo', monument: 'Monumento', park: 'Parque', stadium: 'Estadio', marina: 'Puerto deportivo',
}

export const kindLabel = (kind: PlaceKind, osmValue?: string) =>
  (kind === 'poi' && osmValue && OSM_VALUE_LABELS[osmValue]) || KIND_LABELS[kind]

/* ---------------------------------- Photon --------------------------------- */

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_id: number
    osm_type: 'N' | 'W' | 'R'
    osm_key?: string
    osm_value?: string
    type?: string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    district?: string
    locality?: string
    county?: string
    state?: string
    country?: string
    extent?: [number, number, number, number]
  }
}

const photonClient = new RateLimitedClient(250, 10_000)
const OSM_TYPE: Record<string, string> = { N: 'node', W: 'way', R: 'relation' }

export function placeFromPhoton(f: PhotonFeature): Place | null {
  const p = f.properties
  const [lng, lat] = f.geometry.coordinates
  const kind = kindFromOsm(p.osm_key, p.osm_value, p.type)
  const streetLine = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : undefined
  const name = p.name ?? streetLine
  if (!name) return null
  const parts = [
    p.name && streetLine ? streetLine : undefined,
    p.district && p.district !== name ? p.district : undefined,
    p.city && p.city !== name ? p.city : undefined,
    p.county && p.county !== p.city && p.county !== name ? p.county : undefined,
    p.state && p.state !== name ? p.state : undefined,
    p.country && p.country !== name ? p.country : undefined,
  ].filter(Boolean)
  const ext = p.extent
  return {
    id: `photon:${p.osm_type}${p.osm_id}`,
    name,
    kind,
    kindLabel: kindLabel(kind, p.osm_value),
    address: [...new Set(parts)].join(', ') || undefined,
    lat,
    lng,
    bbox: ext ? { west: ext[0], north: ext[1], east: ext[2], south: ext[3] } : undefined,
    source: 'photon',
    osm: { type: OSM_TYPE[p.osm_type] ?? 'node', id: p.osm_id },
    category: p.osm_value,
  }
}

export const photonProvider: GeocodingProvider = {
  id: 'photon',
  name: 'Photon (komoot, datos OSM)',
  async autocomplete(q, { near, signal } = {}) {
    const url = new URL('/api/', PHOTON_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '8')
    if (near) {
      url.searchParams.set('lat', near.lat.toFixed(4))
      url.searchParams.set('lon', near.lng.toFixed(4))
      url.searchParams.set('location_bias_scale', '0.3')
    }
    const data = await photonClient.request<{ features: PhotonFeature[] }>(url.toString(), { signal })
    return data.features.map(placeFromPhoton).filter((p): p is Place => p !== null)
  },
  async search(q, opts) {
    return this.autocomplete!(q, opts)
  },
}

/* --------------------------------- Nominatim -------------------------------- */

interface NominatimResult {
  place_id: number
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  category?: string
  class?: string
  type: string
  addresstype?: string
  name?: string
  display_name: string
  boundingbox?: [string, string, string, string]
}

// Política de Nominatim: máximo 1 petición por segundo.
const nominatimClient = new RateLimitedClient(1100, 15_000)

export function placeFromNominatim(r: NominatimResult): Place {
  const key = r.category ?? r.class
  const kind = kindFromOsm(key, r.type, r.addresstype)
  const name = r.name || r.display_name.split(',')[0]
  const address = r.display_name.startsWith(name) ? r.display_name.slice(name.length).replace(/^,\s*/, '') : r.display_name
  const bb = r.boundingbox?.map(Number)
  return {
    id: `nominatim:${r.osm_type}${r.osm_id}`,
    name,
    kind,
    kindLabel: kindLabel(kind, r.type),
    address: address || undefined,
    lat: Number(r.lat),
    lng: Number(r.lon),
    bbox: bb ? { south: bb[0], north: bb[1], west: bb[2], east: bb[3] } : undefined,
    source: 'nominatim',
    osm: { type: r.osm_type, id: r.osm_id },
    category: r.type,
  }
}

export const nominatimProvider: GeocodingProvider = {
  id: 'nominatim',
  name: 'Nominatim (OpenStreetMap Foundation)',
  async search(q, { near, signal } = {}) {
    const url = new URL('/search', NOMINATIM_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '10')
    url.searchParams.set('accept-language', 'es')
    if (near) {
      const d = 0.5
      url.searchParams.set('viewbox', [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(','))
    }
    const data = await nominatimClient.request<NominatimResult[]>(url.toString(), { signal })
    return data.map(placeFromNominatim)
  },
  async reverse(lat, lng, { signal, zoom = 18 } = {}) {
    const url = new URL('/reverse', NOMINATIM_URL)
    url.searchParams.set('lat', lat.toFixed(6))
    url.searchParams.set('lon', lng.toFixed(6))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('zoom', String(zoom))
    url.searchParams.set('accept-language', 'es')
    const data = await nominatimClient.request<NominatimResult & { error?: string }>(url.toString(), { signal })
    if (data.error) return null
    return placeFromNominatim(data)
  },
}

export const geocoding = {
  autocompleteProvider: photonProvider,
  searchProvider: nominatimProvider,
  reverseProvider: nominatimProvider,
}

/** Interpreta "39.47, -0.37" como coordenadas. */
export function parseCoordinates(q: string): Place | null {
  const m = q.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return {
    id: `coords:${lat},${lng}`,
    name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    kind: 'coordinates',
    kindLabel: KIND_LABELS.coordinates,
    lat,
    lng,
    source: 'map',
  }
}
