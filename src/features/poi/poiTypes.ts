export type PoiCategory =
  | 'gas_station'
  | 'mechanic'
  | 'garage'
  | 'shop'
  | 'restaurant'
  | 'parking'
  | 'airport'
  | 'harbor'
  | 'landmark'
  | 'hospital'
  | 'police'
  | 'residential'

export interface POI {
  id: string
  /** Nombre real de OSM; `null` si el elemento no tiene nombre (no se inventa). */
  name: string | null
  category: PoiCategory
  coordinates: { lat: number; lng: number }
  address?: string
  tags: string[]
  osm: { type: 'node' | 'way' | 'relation'; id: number }
  nodeId?: string
}

export interface PoiCategoryDef {
  id: PoiCategory
  label: string
  plural: string
  /** Nombre de icono de lucide-react. */
  icon: string
  color: string
  /** Selectores Overpass QL (sin bbox). */
  selectors: string[]
  /** Palabras clave para búsqueda (normalizadas, sin acentos). */
  keywords: string[]
  /** Radio máximo de búsqueda sugerido en metros. */
  searchRadius: number
  matches: (tags: Record<string, string>) => boolean
}

export const POI_CATEGORIES: PoiCategoryDef[] = [
  {
    id: 'gas_station',
    label: 'Gasolinera',
    plural: 'Gasolineras',
    icon: 'Fuel',
    color: '#f97316',
    selectors: ['nwr["amenity"="fuel"]'],
    keywords: ['gasolinera', 'gasolineras', 'combustible', 'gasolina', 'fuel', 'repostar'],
    searchRadius: 8000,
    matches: (t) => t.amenity === 'fuel',
  },
  {
    id: 'mechanic',
    label: 'Taller',
    plural: 'Talleres',
    icon: 'Wrench',
    color: '#64748b',
    selectors: ['nwr["shop"="car_repair"]', 'nwr["shop"="tyres"]'],
    keywords: ['taller', 'talleres', 'mecanico', 'neumaticos', 'reparacion'],
    searchRadius: 6000,
    matches: (t) => t.shop === 'car_repair' || t.shop === 'tyres',
  },
  {
    id: 'garage',
    label: 'Concesionario / garaje',
    plural: 'Concesionarios y garajes',
    icon: 'Warehouse',
    color: '#78716c',
    selectors: ['nwr["shop"="car"]', 'nwr["amenity"="parking"]["parking"~"^(multi-storey|underground)$"]'],
    keywords: ['garaje', 'garajes', 'concesionario', 'concesionarios'],
    searchRadius: 6000,
    matches: (t) => t.shop === 'car' || (t.amenity === 'parking' && /multi-storey|underground/.test(t.parking ?? '')),
  },
  {
    id: 'shop',
    label: 'Tienda',
    plural: 'Tiendas',
    icon: 'ShoppingBag',
    color: '#ec4899',
    selectors: ['nwr["shop"~"^(supermarket|convenience|mall|department_store|bakery|greengrocer|butcher|clothes|hardware)$"]'],
    keywords: ['tienda', 'tiendas', 'supermercado', 'super', 'compras', 'panaderia', 'comercio'],
    searchRadius: 3000,
    matches: (t) => !!t.shop && !['car', 'car_repair', 'tyres'].includes(t.shop),
  },
  {
    id: 'restaurant',
    label: 'Restaurante',
    plural: 'Restaurantes',
    icon: 'UtensilsCrossed',
    color: '#ef4444',
    selectors: ['nwr["amenity"~"^(restaurant|cafe|fast_food|bar)$"]'],
    keywords: ['restaurante', 'restaurantes', 'comer', 'cafe', 'cafeteria', 'bar', 'bares', 'comida'],
    searchRadius: 3000,
    matches: (t) => /^(restaurant|cafe|fast_food|bar)$/.test(t.amenity ?? ''),
  },
  {
    id: 'parking',
    label: 'Aparcamiento',
    plural: 'Aparcamientos',
    icon: 'SquareParking',
    color: '#3b82f6',
    selectors: ['nwr["amenity"="parking"]'],
    keywords: ['parking', 'aparcamiento', 'aparcamientos', 'aparcar', 'estacionamiento'],
    searchRadius: 3000,
    matches: (t) => t.amenity === 'parking',
  },
  {
    id: 'airport',
    label: 'Aeropuerto',
    plural: 'Aeropuertos',
    icon: 'Plane',
    color: '#0ea5e9',
    selectors: ['nwr["aeroway"="aerodrome"]["name"]'],
    keywords: ['aeropuerto', 'aeropuertos', 'aerodromo', 'avion', 'vuelos'],
    searchRadius: 60000,
    matches: (t) => t.aeroway === 'aerodrome',
  },
  {
    id: 'harbor',
    label: 'Puerto',
    plural: 'Puertos',
    icon: 'Anchor',
    color: '#0891b2',
    selectors: ['nwr["harbour"="yes"]', 'nwr["leisure"="marina"]', 'nwr["landuse"="port"]["name"]'],
    keywords: ['puerto', 'puertos', 'marina', 'dársena', 'darsena', 'muelle'],
    searchRadius: 40000,
    matches: (t) => t.harbour === 'yes' || t.leisure === 'marina' || t.landuse === 'port',
  },
  {
    id: 'landmark',
    label: 'Lugar emblemático',
    plural: 'Lugares emblemáticos',
    icon: 'Landmark',
    color: '#a855f7',
    selectors: [
      'nwr["tourism"~"^(attraction|museum|viewpoint)$"]["name"]',
      'nwr["historic"~"^(monument|castle|memorial|church|archaeological_site|ruins|city_gate)$"]["name"]',
    ],
    keywords: ['monumento', 'monumentos', 'museo', 'museos', 'castillo', 'mirador', 'turismo', 'emblematico', 'lugares'],
    searchRadius: 5000,
    matches: (t) => /^(attraction|museum|viewpoint)$/.test(t.tourism ?? '') || !!t.historic,
  },
  {
    id: 'hospital',
    label: 'Hospital / centro de salud',
    plural: 'Hospitales y centros de salud',
    icon: 'Cross',
    color: '#dc2626',
    selectors: ['nwr["amenity"~"^(hospital|clinic)$"]'],
    keywords: ['hospital', 'hospitales', 'urgencias', 'clinica', 'centro de salud', 'salud', 'medico'],
    searchRadius: 10000,
    matches: (t) => t.amenity === 'hospital' || t.amenity === 'clinic',
  },
  {
    id: 'police',
    label: 'Policía',
    plural: 'Comisarías',
    icon: 'Shield',
    color: '#1d4ed8',
    selectors: ['nwr["amenity"="police"]'],
    keywords: ['policia', 'comisaria', 'guardia civil', 'cuartel'],
    searchRadius: 8000,
    matches: (t) => t.amenity === 'police',
  },
  {
    id: 'residential',
    label: 'Barrio',
    plural: 'Barrios',
    icon: 'House',
    color: '#16a34a',
    selectors: ['node["place"~"^(neighbourhood|suburb|quarter)$"]["name"]'],
    keywords: ['barrio', 'barrios', 'distrito', 'urbanizacion', 'zona residencial'],
    searchRadius: 6000,
    matches: (t) => /^(neighbourhood|suburb|quarter)$/.test(t.place ?? ''),
  },
]

export const POI_CATEGORY_MAP = Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c])) as Record<
  PoiCategory,
  PoiCategoryDef
>

export function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  // Orden relevante: categorías más específicas primero.
  const order: PoiCategory[] = [
    'gas_station', 'mechanic', 'garage', 'parking', 'airport', 'harbor', 'hospital', 'police',
    'restaurant', 'landmark', 'shop', 'residential',
  ]
  for (const id of order) if (POI_CATEGORY_MAP[id].matches(tags)) return id
  return null
}

export function poiAddress(tags: Record<string, string>): string | undefined {
  const street = tags['addr:street']
  if (!street) return tags['addr:city']
  const num = tags['addr:housenumber'] ? ` ${tags['addr:housenumber']}` : ''
  const city = tags['addr:city'] ? `, ${tags['addr:city']}` : ''
  return `${street}${num}${city}`
}

export interface OsmPoiElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Convierte elementos Overpass en POIs tipados conservando nombres reales. */
export function poisFromOsm(elements: OsmPoiElement[], only?: PoiCategory[]): POI[] {
  const out: POI[] = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat === undefined || lng === undefined) continue
    const category = classifyPoi(tags)
    if (!category || (only && !only.includes(category))) continue
    out.push({
      id: `${el.type}/${el.id}`,
      name: tags.name ?? tags.brand ?? null,
      category,
      coordinates: { lat, lng },
      address: poiAddress(tags),
      tags: Object.entries(tags)
        .filter(([k]) => ['amenity', 'shop', 'tourism', 'historic', 'aeroway', 'cuisine', 'brand'].includes(k))
        .map(([, v]) => v),
      osm: { type: el.type, id: el.id },
    })
  }
  return out
}
