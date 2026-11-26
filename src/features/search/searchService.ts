import { geocoding, kindLabel, parseCoordinates, type Place } from '@/features/geocoding/geocodingService'
import { networkStore, STREET_CLUSTER_M } from '@/features/osm/networkStore'
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
  for (const spots of networkStore.streetIndex().values()) {
    const score = matchScore(spots[0].name, query)
    if (score === 0) continue
    for (const s of spots) {
      scored.push({
        score,
        place: {
          id: `street:${s.name}@${s.lat.toFixed(4)},${s.lng.toFixed(4)}`,
          name: s.name,
          kind: 'street',
          kindLabel: kindLabel('street'),
          address: 'Calle de la zona cargada en el mapa',
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

/** Importancia dentro de un grupo de transporte con el mismo nombre (se queda la mayor). */
const TRANSIT_RANK: Record<string, number> = {
  'railway=station': 4, 'public_transport=station': 4, 'amenity=bus_station': 4,
  'railway=halt': 3, 'railway=stop': 2, 'public_transport=stop_position': 2,
  'railway=platform': 1, 'public_transport=platform': 1, 'railway=tram_stop': 2,
}
const transitRank = (p: Place) => (p.osmKey && p.category ? TRANSIT_RANK[`${p.osmKey}=${p.category}`] : undefined)

/** Distancia máxima para considerar que dos resultados con el mismo nombre son el mismo lugar. */
export const SAME_PLACE_M = 400

/**
 * Quita resultados repetidos sin perder lugares distintos:
 *  - el mismo objeto OSM (o el mismo nombre en el mismo punto) solo una vez;
 *  - una estación con sus paradas y andenes del mismo nombre (OSM los mapea por
 *    separado) es un único resultado: la estación;
 *  - el mismo nombre y tipo a menos de SAME_PLACE_M (p. ej. una calle partida en
 *    varios tramos) también.
 * Lugares con el mismo nombre pero lejos (la Calle Mayor de dos pueblos) se conservan.
 */
export function dedupePlaces(places: Place[]): Place[] {
  const seen = new Set<string>()
  const out: Place[] = []
  for (const p of places) {
    const key = p.osm ? `${p.osm.type}${p.osm.id}` : `${normalize(p.name)}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    if (p.kind === 'category' || p.kind === 'coordinates') {
      out.push(p)
      continue
    }
    const name = normalize(p.name)
    const rank = transitRank(p)
    const twin = out.findIndex(
      (q) =>
        normalize(q.name) === name &&
        haversine(q.lat, q.lng, p.lat, p.lng) <= SAME_PLACE_M &&
        (q.kindLabel === p.kindLabel || (rank !== undefined && transitRank(q) !== undefined)),
    )
    if (twin === -1) out.push(p)
    // Del grupo de transporte se queda la estación (en la posición del primero).
    else if (rank !== undefined && rank > (transitRank(out[twin]) ?? 0)) out[twin] = p
  }
  return out
}

const cache = new Map<string, Place[]>()

export interface SearchOptions {
  near?: { lat: number; lng: number }
  pois?: POI[]
  /** Favoritos e historial: se ofrecen al instante si coinciden. */
  saved?: Place[]
  signal?: AbortSignal
  /** true = búsqueda confirmada (Enter) → Nominatim; false = autocompletado → Photon. */
  submit?: boolean
}

/**
 * Búsqueda combinada: coordenadas, categoría, datos locales y geocodificador remoto.
 * Cachea por consulta para evitar peticiones repetidas.
 */
/** Favoritos e historial que coinciden con la búsqueda (sin red). */
function searchSaved(query: string, saved: Place[], near?: { lat: number; lng: number }): Place[] {
  const scored = saved
    .map((p) => ({ p, score: matchScore(p.name, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p)
  return withDistances(scored, near)
}

/**
 * Resultados INSTANTÁNEOS (sin red): coordenadas, categoría, favoritos/historial y
 * calles o POIs ya cargados. Se muestran mientras responde el servidor.
 */
export function searchInstant(query: string, opts: Omit<SearchOptions, 'signal' | 'submit'> = {}): Place[] {
  const q = query.trim()
  if (q.length < 2) return []
  const coords = parseCoordinates(q)
  if (coords) return [coords]
  const cat = detectCategory(q)
  return dedupePlaces([
    ...(cat ? [categoryPlace(cat)] : []),
    ...searchSaved(q, opts.saved ?? [], opts.near),
    ...searchLocal(q, opts.pois ?? [], opts.near),
  ])
}

export async function searchPlaces(query: string, opts: SearchOptions = {}): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  if (parseCoordinates(q)) return searchInstant(q, opts)
  const instant = searchInstant(q, opts)

  const provider = opts.submit ? geocoding.searchProvider : geocoding.autocompleteProvider
  const nearKey = opts.near ? `${opts.near.lat.toFixed(1)},${opts.near.lng.toFixed(1)}` : ''
  const key = `${provider.id}|${normalize(q)}|${nearKey}`
  let remote = cache.get(key)
  if (!remote && q.length >= 3) {
    const fn = opts.submit ? provider.search : (provider.autocomplete ?? provider.search)
    remote = await fn.call(provider, q, { near: opts.near, signal: opts.signal })
    cache.set(key, remote)
    // Caché acotada: se descarta la entrada más antigua.
    if (cache.size > 200) cache.delete(cache.keys().next().value!)
  }
  // Una calle local es la misma que un resultado remoto solo si se llama igual Y está
  // cerca (el remoto trae la población): la Calle Mayor de otro pueblo se conserva.
  const sameStreet = (p: Place) =>
    (remote ?? []).some(
      (r) => normalize(r.name) === normalize(p.name) && haversine(r.lat, r.lng, p.lat, p.lng) < STREET_CLUSTER_M,
    )
  const head = instant.filter((p) => p.kind === 'category')
  const extra = instant.filter((p) => p.kind !== 'category' && !(p.kind === 'street' && sameStreet(p)))
  return dedupePlaces([...head, ...withDistances(remote ?? [], opts.near), ...extra])
}

/** ¿Hay resultados remotos ya en caché para esta búsqueda? (para mostrarlos sin esperar). */
export function hasCachedRemote(query: string, near?: { lat: number; lng: number }) {
  const nearKey = near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''
  return cache.has(`${geocoding.autocompleteProvider.id}|${normalize(query.trim())}|${nearKey}`)
}
