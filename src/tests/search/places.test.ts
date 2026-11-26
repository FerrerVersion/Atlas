import { describe, expect, it } from 'vitest'
import { placeFromPhoton } from '@/features/geocoding/geocodingService'
import { dedupePlaces } from '@/features/search/searchService'

/** Respuestas REALES de Photon (26/11/2026) para «Buñol» y «Puçol», resumidas. */
type Props = Record<string, unknown>
const f = (lng: number, lat: number, p: Props) => ({ geometry: { coordinates: [lng, lat] as [number, number] }, properties: p as never })
const BUNOL = [
  f(-0.791, 39.419, { name: 'Buñol', osm_key: 'place', osm_value: 'town', type: 'city', osm_type: 'R', osm_id: 346693, county: 'La Hoya de Buñol', state: 'Comunitat Valenciana', country: 'España' }),
  f(-0.7874, 39.4271, { name: 'Buñol', osm_key: 'railway', osm_value: 'station', type: 'house', osm_type: 'W', osm_id: 659253286, street: 'Carretera de la Estación', city: 'Buñol' }),
  f(-0.7875, 39.4272, { name: 'Buñol', osm_key: 'railway', osm_value: 'stop', type: 'house', osm_type: 'N', osm_id: 11350124528, street: 'Carretera de la Estación', city: 'Buñol' }),
  f(-0.7875, 39.4273, { name: 'Buñol', osm_key: 'railway', osm_value: 'stop', type: 'house', osm_type: 'N', osm_id: 8528066019, street: 'Carretera de la Estación', city: 'Buñol' }),
  f(-0.7872, 39.427, { name: 'Buñol', osm_key: 'railway', osm_value: 'stop', type: 'house', osm_type: 'N', osm_id: 11350124527, street: 'Calle Vicente Aleixandre', city: 'Buñol' }),
  f(-0.7896, 39.4211, { name: 'Buñol, Jaime Balmes 6', osm_key: 'highway', osm_value: 'bus_stop', type: 'house', osm_type: 'N', osm_id: 13070747579, street: 'Calle de Eduardo Ruiz Pons', city: 'Buñol' }),
]
const PUCOL = [
  f(-0.3028, 39.6172, { name: 'Puçol', osm_key: 'place', osm_value: 'town', type: 'city', osm_type: 'R', osm_id: 346558 }),
  f(-0.3031, 39.6205, { name: 'Puçol', osm_key: 'railway', osm_value: 'station', type: 'house', osm_type: 'N', osm_id: 7221315772, street: 'Carrer de la Font de Mora', city: 'Puçol' }),
  f(-0.3021, 39.6212, { name: 'Puçol', osm_key: 'railway', osm_value: 'platform', type: 'house', osm_type: 'W', osm_id: 568370107, street: 'Avinguda dels Collidors', city: 'Puçol' }),
  f(-0.3028, 39.6207, { name: 'Puçol', osm_key: 'railway', osm_value: 'stop', type: 'house', osm_type: 'N', osm_id: 6628637794, street: 'Carrer de la Font de Mora', city: 'Puçol' }),
  f(-0.3028, 39.6208, { name: 'Puçol', osm_key: 'railway', osm_value: 'platform', type: 'house', osm_type: 'W', osm_id: 568370106, street: 'Carrer de la Font de Mora', city: 'Puçol' }),
  f(-0.3083, 39.6183, { name: 'Puçol, Av. Hostalets, 85', osm_key: 'highway', osm_value: 'bus_stop', type: 'house', osm_type: 'N', osm_id: 11969239179, street: 'Avinguda dels Hostalets', city: 'Puçol' }),
]
const places = (fs: ReturnType<typeof f>[]) => fs.map((x) => placeFromPhoton(x)!)

describe('etiquetas de los resultados', () => {
  it('estaciones, paradas, andenes y paradas de autobús no son «Dirección» ni «Calle»', () => {
    const labels = places([...BUNOL, ...PUCOL]).map((p) => `${p.name} · ${p.kindLabel}`)
    expect(labels).toContain('Buñol · Municipio')
    expect(labels).toContain('Buñol · Estación de tren')
    expect(labels).toContain('Buñol · Parada de tren')
    expect(labels).toContain('Puçol · Andén')
    expect(labels).toContain('Buñol, Jaime Balmes 6 · Parada de autobús')
    expect(labels.some((l) => /Dirección|Calle$/.test(l))).toBe(false)
  })

  it('las calles siguen siendo calles', () => {
    const calle = placeFromPhoton(f(-0.79, 39.42, { name: 'Calle Mayor', osm_key: 'highway', osm_value: 'residential', type: 'street', osm_type: 'W', osm_id: 1, city: 'Buñol' }))!
    expect(calle.kindLabel).toBe('Calle')
  })
})

describe('resultados duplicados', () => {
  it('la estación con sus paradas y andenes del mismo nombre es un solo resultado', () => {
    const b = dedupePlaces(places(BUNOL))
    expect(b.map((p) => `${p.name} · ${p.kindLabel}`)).toEqual([
      'Buñol · Municipio',
      'Buñol · Estación de tren',
      'Buñol, Jaime Balmes 6 · Parada de autobús',
    ])
    const p = dedupePlaces(places(PUCOL))
    expect(p.map((x) => `${x.name} · ${x.kindLabel}`)).toEqual([
      'Puçol · Municipio',
      'Puçol · Estación de tren',
      'Puçol, Av. Hostalets, 85 · Parada de autobús',
    ])
  })

  it('no junta lugares distintos con el mismo nombre si están lejos', () => {
    const a = placeFromPhoton(f(-0.79, 39.42, { name: 'Calle Mayor', osm_key: 'highway', osm_value: 'residential', type: 'street', osm_type: 'W', osm_id: 1, city: 'Buñol' }))!
    const b = placeFromPhoton(f(-0.30, 39.62, { name: 'Calle Mayor', osm_key: 'highway', osm_value: 'residential', type: 'street', osm_type: 'W', osm_id: 2, city: 'Puçol' }))!
    expect(dedupePlaces([a, b])).toHaveLength(2)
  })
})
