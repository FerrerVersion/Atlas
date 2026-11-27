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
  /** Clave OSM principal (railway, highway, amenity…): distingue p. ej. una estación de tren de una calle. */
  osmKey?: string
  /** Rumbo (°) de un origen GPS en marcha: el recálculo parte en tu sentido de circulación. */
  heading?: number
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

/** Valores de `highway` que son vías (el resto —paradas, andenes— son lugares). */
const ROAD_VALUES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street',
  'pedestrian', 'track', 'road', 'footway', 'path', 'cycleway', 'steps', 'bridleway',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
])
/** Claves OSM de lugares de interés (se comprueban ANTES que «tiene número de portal»). */
const POI_KEYS = new Set([
  'amenity', 'shop', 'tourism', 'historic', 'leisure', 'aeroway', 'office', 'railway', 'craft', 'public_transport',
  'healthcare', 'man_made', 'natural', 'sport', 'emergency', 'club', 'landuse',
])

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
  // Solo las vías son calles: una parada de autobús (highway=bus_stop) es un lugar.
  if (key === 'highway') return ROAD_VALUES.has(v) ? 'street' : 'poi'
  // Photon marca como «house» cualquier elemento con dirección postal (también una
  // estación o una tienda): por eso las claves de lugar se miran antes.
  if (key && POI_KEYS.has(key)) return 'poi'
  if (key === 'building' || type === 'house') return 'address'
  if (type === 'street') return 'street'
  if (type === 'city') return 'city'
  if (type === 'district' || type === 'locality') return 'suburb'
  return 'other'
}

/** Etiquetas por «clave=valor» (más precisas) o solo por valor. */
const OSM_TAG_LABELS: Record<string, string> = {
  'railway=station': 'Estación de tren', 'railway=halt': 'Apeadero', 'railway=stop': 'Parada de tren',
  'railway=platform': 'Andén', 'railway=tram_stop': 'Parada de tranvía', 'railway=subway_entrance': 'Acceso al metro',
  'public_transport=station': 'Estación', 'public_transport=platform': 'Parada', 'public_transport=stop_position': 'Parada',
  'highway=bus_stop': 'Parada de autobús', 'highway=platform': 'Parada de autobús', 'amenity=bus_station': 'Estación de autobuses',
  'aeroway=terminal': 'Terminal de aeropuerto', 'aeroway=aerodrome': 'Aeropuerto', 'amenity=parking': 'Aparcamiento',
}
const OSM_VALUE_LABELS: Record<string, string> = {
  fuel: 'Gasolinera', restaurant: 'Restaurante', cafe: 'Cafetería', bar: 'Bar', pub: 'Bar', fast_food: 'Comida rápida',
  hospital: 'Hospital', clinic: 'Centro de salud', doctors: 'Centro de salud', police: 'Policía', pharmacy: 'Farmacia',
  supermarket: 'Supermercado', bakery: 'Panadería', convenience: 'Tienda', museum: 'Museo', attraction: 'Atracción',
  aerodrome: 'Aeropuerto', station: 'Estación', school: 'Centro educativo', university: 'Universidad', hotel: 'Hotel',
  castle: 'Castillo', monument: 'Monumento', park: 'Parque', stadium: 'Estadio', marina: 'Puerto deportivo',
  townhall: 'Ayuntamiento', library: 'Biblioteca', place_of_worship: 'Lugar de culto', bank: 'Banco', atm: 'Cajero',
}

export const kindLabel = (kind: PlaceKind, osmValue?: string, osmKey?: string) =>
  (kind === 'poi' && ((osmKey && osmValue && OSM_TAG_LABELS[`${osmKey}=${osmValue}`]) || (osmValue && OSM_VALUE_LABELS[osmValue]))) ||
  KIND_LABELS[kind]

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
  const ref = `${p.osm_type}${p.osm_id}`
  // Si ya se conoce su nombre en español (name:es de OSM), se usa ese.
  const name = (PLACE_KINDS.has(kind) ? spanishNames.get(ref) : undefined) ?? p.name ?? streetLine
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
    kindLabel: kindLabel(kind, p.osm_value, p.osm_key),
    address: [...new Set(parts)].join(', ') || undefined,
    lat,
    lng,
    bbox: ext ? { west: ext[0], north: ext[1], east: ext[2], south: ext[3] } : undefined,
    source: 'photon',
    osm: { type: OSM_TYPE[p.osm_type] ?? 'node', id: p.osm_id },
    category: p.osm_value,
    osmKey: p.osm_key,
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
    kindLabel: kindLabel(kind, r.type, key),
    address: address || undefined,
    lat: Number(r.lat),
    lng: Number(r.lon),
    bbox: bb ? { south: bb[0], north: bb[1], west: bb[2], east: bb[3] } : undefined,
    source: 'nominatim',
    osm: { type: r.osm_type, id: r.osm_id },
    category: r.type,
    osmKey: key,
  }
}

/* --------------------- Nombres en español (sin inventar) --------------------- */

/**
 * Photon solo devuelve el nombre oficial local (p. ej. «València») y no admite el
 * español; Nominatim sí (name:es de OSM) pero su política no permite usarlo para
 * autocompletar. Por eso el nombre en español se consulta UNA vez, al elegir un
 * municipio, región o país, y se recuerda: las búsquedas siguientes ya lo muestran.
 */
export const PLACE_KINDS = new Set<PlaceKind>(['country', 'region', 'city', 'town', 'village', 'suburb'])
/** Referencia OSM corta («R344953») → nombre en español. */
const spanishNames = new Map<string, string>()
const shortRef = (osm: { type: string; id: number }) => `${osm.type.charAt(0).toUpperCase()}${osm.id}`

export function rememberSpanishName(place: Place) {
  if (place.osm && PLACE_KINDS.has(place.kind) && place.source === 'nominatim') spanishNames.set(shortRef(place.osm), place.name)
}

/** ¿Hay que consultar su nombre en español? (municipios y similares de Photon aún no consultados). */
export function needsSpanishName(place: Place): boolean {
  return place.source === 'photon' && !!place.osm && PLACE_KINDS.has(place.kind) && !spanishNames.has(shortRef(place.osm))
}

const pendingNames = new Map<string, Promise<string | null>>()

/** Devuelve el lugar con su nombre en español de OSM (o tal cual si no tiene otro). */
export async function resolveSpanishName(place: Place): Promise<Place> {
  if (!place.osm || !PLACE_KINDS.has(place.kind)) return place
  const ref = shortRef(place.osm)
  const known = spanishNames.get(ref)
  if (known) return known === place.name ? place : { ...place, name: known }
  let job = pendingNames.get(ref)
  if (!job) {
    job = (async () => {
      const url = new URL('/lookup', NOMINATIM_URL)
      url.searchParams.set('osm_ids', ref)
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('accept-language', 'es')
      const data = await nominatimClient.request<NominatimResult[]>(url.toString())
      const name = data[0]?.name?.trim() || null
      spanishNames.set(ref, name ?? place.name)
      return name
    })().finally(() => pendingNames.delete(ref))
    pendingNames.set(ref, job)
  }
  const name = await job.catch(() => null)
  return name && name !== place.name ? { ...place, name } : place
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
    const places = data.map(placeFromNominatim)
    places.forEach(rememberSpanishName)
    return places
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
