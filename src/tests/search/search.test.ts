import { describe, expect, it } from 'vitest'
import { kindFromOsm, parseCoordinates, placeFromNominatim, placeFromPhoton } from '@/features/geocoding/geocodingService'
import { detectCategory, matchScore, normalize, searchLocal } from '@/features/search/searchService'
import { networkStore } from '@/features/osm/networkStore'
import { demoRoads } from '@/data/demo'

describe('normalización', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(normalize('BUÑOL')).toBe('bunol')
    expect(normalize('  València   ')).toBe('valencia')
    expect(matchScore('Buñol', 'bunol')).toBe(100)
    expect(matchScore('Avenida de Vicente Blasco Ibáñez', 'blasco')).toBeGreaterThan(0)
    expect(matchScore('Madrid', 'xyz')).toBe(0)
  })

  it('prefiere coincidencias por prefijo', () => {
    expect(matchScore('Valencia', 'val')).toBeGreaterThan(matchScore('Puerto de Valencia', 'val'))
  })
})

describe('detección de categorías', () => {
  it('reconoce búsquedas por tipo de lugar', () => {
    expect(detectCategory('gasolineras')).toBe('gas_station')
    expect(detectCategory('Restaurantes cerca')).toBe('restaurant')
    expect(detectCategory('hospital')).toBe('hospital')
    expect(detectCategory('aparcamiento')).toBe('parking')
    expect(detectCategory('Buñol')).toBeNull()
  })
})

describe('coordenadas', () => {
  it('interpreta lat,lng', () => {
    expect(parseCoordinates('39.4699, -0.3763')).toMatchObject({ lat: 39.4699, lng: -0.3763, kind: 'coordinates' })
    expect(parseCoordinates('95, 10')).toBeNull()
    expect(parseCoordinates('Valencia')).toBeNull()
  })
})

describe('adaptadores de geocodificación (conservan nombres reales)', () => {
  it('Photon', () => {
    const p = placeFromPhoton({
      geometry: { coordinates: [-0.7909637, 39.4189582] },
      properties: {
        osm_id: 346693,
        osm_type: 'R',
        osm_key: 'place',
        osm_value: 'town',
        name: 'Buñol',
        county: 'La Hoya de Buñol',
        state: 'Comunitat Valenciana',
        country: 'España',
        extent: [-0.97, 39.48, -0.73, 39.38],
      },
    })!
    expect(p.name).toBe('Buñol')
    expect(p.kind).toBe('town')
    expect(p.address).toBe('La Hoya de Buñol, Comunitat Valenciana, España')
    expect(p.bbox).toEqual({ west: -0.97, north: 39.48, east: -0.73, south: 39.38 })
  })

  it('Nominatim', () => {
    const p = placeFromNominatim({
      place_id: 1,
      osm_type: 'relation',
      osm_id: 344953,
      lat: '39.4697065',
      lon: '-0.3763353',
      category: 'boundary',
      type: 'administrative',
      addresstype: 'city',
      name: 'València',
      display_name: 'València, Comarca de València, València / Valencia, Comunitat Valenciana, España',
      boundingbox: ['39.27', '39.57', '-0.43', '-0.27'],
    })
    expect(p.name).toBe('València')
    expect(p.kind).toBe('city')
    expect(p.address).toBe('Comarca de València, València / Valencia, Comunitat Valenciana, España')
  })

  it('clasifica tipos OSM', () => {
    expect(kindFromOsm('place', 'city')).toBe('city')
    expect(kindFromOsm('place', 'neighbourhood')).toBe('suburb')
    expect(kindFromOsm('highway', 'residential')).toBe('street')
    expect(kindFromOsm('amenity', 'fuel')).toBe('poi')
  })
})

describe('búsqueda local en datos cargados', () => {
  it('encuentra calles reales del extracto sin red', () => {
    networkStore.clear()
    networkStore.addWays(demoRoads)
    const res = searchLocal('blasco ibanez', [])
    expect(res[0].name).toBe('Avenida de Vicente Blasco Ibáñez')
    expect(res[0].kind).toBe('street')
    networkStore.clear()
  })
})
