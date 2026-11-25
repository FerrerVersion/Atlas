import { geocoding, kindLabel, parseCoordinates, type Place } from '@/features/geocoding/geocodingService'
import { networkStore } from '@/features/osm/networkStore'
import { POI_CATEGORIES, POI_CATEGORY_MAP, type POI, type PoiCategory } from '@/features/poi/poiTypes'
import { haversine } from '@/utils/distance'

/** Normaliza para comparar: minúsculas y sin acentos/diacríticos. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Puntuación simple de relevancia (0 = no coincide). */
export function matchScore(candidate: string, query: string): number {
  const c = normalize(candidate)
  const q = normalize(query)
  if (!q) return 0
  if (c === q) return 100
  if (c.startsWith(q)) return 80
  const words = c.split(/[\s,.\-/]+/)
  if (words.some((w) => w.startsWith(q))) return 60
  if (c.includes(q)) return 40
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length > 1 && tokens.every((t) => c.includes(t))) return 30
  return 0
}

/** Detecta búsquedas por categoría ("gasolineras", "restaurante cerca"…). */
export function detectCategory(query: string): PoiCategory | null {
  const q = normalize(query).replace(/\b(cerca|cercan[oa]s?|aqui|en la zona|de la zona)\b/g, '').trim()
  if (q.length < 3) return null
  for (const c of POI_CATEGORIES) {
    if (c.keywords.some((k) => normalize(k) === q || (q.length >= 4 && normalize(k).startsWith(q)))) return c.id
  }
  return null
}

export function categoryPlace(cat: PoiCategory): Place {
  const def = POI_CATEGORY_MAP[cat]
  return {
    id: `category:${cat}`,
    name: `${def.plural} en esta zona`,
    kind: 'category',
    kindLabel: 'Buscar por categoría',
    address: 'Datos de OpenStreetMap alrededor del mapa',
    lat: 0,
    lng: 0,
    source: 'overpass',
    category: cat,
  }
}

export function poiToPlace(p: POI): Place {
  const def = POI_CATEGORY_MAP[p.category]
  return {
    id: `poi:${p.id}`,
    name: p.name ?? `${def.label} (sin nombre en OSM)`,
    kind: 'poi',
    kindLabel: def.label,
    address: p.address,
    lat: p.coordinates.lat,
    lng: p.coordinates.lng,
    source: 'local',
    category: p.category,
    osm: p.osm,
  }
}

/** Busca entre las calles y POIs ya descargados (sin red). */
export function searchLocal(query: string, pois: POI[], near?: { lat: number; lng: number }, limit = 6): Place[] {
  if (normalize(query).length < 2) return []
  const scored: { place: Place; score: number }[] = []
  for (const s of networkStore.streetIndex().values()) {
    const score = matchScore(s.name, query)
    if (score > 0) {
      scored.push({
        score,
        place: {
          id: `street:${s.name}`,
          name: s.name,
          kind: 'street',
          kindLabel: kindLabel('street'),
          address: 'Calle en la zona cargada',
          lat: s.lat,
          lng: s.lng,
          source: 'local',
        },
      })
    }
  }
  for (const p of pois) {
    if (!p.name) continue
    const score = matchScore(p.name, query)
    if (score > 0) scored.push({ score: score + 5, place: poiToPlace(p) })
  }
  return withDistances(
    scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.place),
    near,
  )
}

export function withDistances(places: Place[], near?: { lat: number; lng: number }): Place[] {
  if (!near) return places
  return places.map((p) =>
    p.kind === 'category' ? p : { ...p, distanceMeters: haversine(near.lat, near.lng, p.lat, p.lng) },
  )
}

function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>()
  return places.filter((p) => {
    const key = p.osm ? `${p.osm.type}${p.osm.id}` : `${normalize(p.name)}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const cache = new Map<string, Place[]>()

export interface SearchOptions {
  near?: { lat: number; lng: number }
  pois?: POI[]
  signal?: AbortSignal
  /** true = búsqueda confirmada (Enter) → Nominatim; false = autocompletado → Photon. */
  submit?: boolean
}

/**
 * Búsqueda combinada: coordenadas, categoría, datos locales y geocodificador remoto.
 * Cachea por consulta para evitar peticiones repetidas.
 */
export async function searchPlaces(query: string, opts: SearchOptions = {}): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const coords = parseCoordinates(q)
  if (coords) return [coords]

  const head: Place[] = []
  const cat = detectCategory(q)
  if (cat) head.push(categoryPlace(cat))
  const local = searchLocal(q, opts.pois ?? [], opts.near)

  const provider = opts.submit ? geocoding.searchProvider : geocoding.autocompleteProvider
  const nearKey = opts.near ? `${opts.near.lat.toFixed(1)},${opts.near.lng.toFixed(1)}` : ''
  const key = `${provider.id}|${normalize(q)}|${nearKey}`
  let remote = cache.get(key)
  if (!remote && q.length >= 3) {
    const fn = opts.submit ? provider.search : (provider.autocomplete ?? provider.search)
    remote = await fn.call(provider, q, { near: opts.near, signal: opts.signal })
    cache.set(key, remote)
  }
  return dedupe([...head, ...withDistances(remote ?? [], opts.near), ...local])
}
