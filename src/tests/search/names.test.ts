import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  needsSpanishName,
  placeFromNominatim,
  placeFromPhoton,
  rememberSpanishName,
  resolveSpanishName,
} from '@/features/geocoding/geocodingService'
import { networkStore } from '@/features/osm/networkStore'
import { searchLocal } from '@/features/search/searchService'
import type { OsmWay } from '@/features/routing/graph'

afterEach(() => {
  vi.unstubAllGlobals()
  networkStore.clear()
})

/** Respuesta real de Photon para «Valencia»: solo el nombre oficial local. */
const valenciaPhoton = () =>
  placeFromPhoton({
    geometry: { coordinates: [-0.3763, 39.4697] },
    properties: { name: 'València', osm_key: 'place', osm_value: 'city', type: 'city', osm_type: 'R', osm_id: 344953, country: 'España' } as never,
  })!

describe('nombres en español (name:es de OSM, sin inventar)', () => {
  it('al elegir un municipio se consulta una vez su nombre en español y luego se recuerda', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return Response.json([{ place_id: 1, osm_type: 'relation', osm_id: 344953, lat: '39.4697', lon: '-0.3763', category: 'place', type: 'city', name: 'Valencia', display_name: 'Valencia, España' }])
    }))
    const p = valenciaPhoton()
    expect(p.name).toBe('València')
    expect(needsSpanishName(p)).toBe(true)
    const named = await resolveSpanishName(p)
    expect(named.name).toBe('Valencia')
    expect(named.lat).toBe(p.lat)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/\/lookup\?osm_ids=R344953.*accept-language=es/)
    // Ya conocido: Photon lo muestra en español sin volver a consultar.
    expect(valenciaPhoton().name).toBe('Valencia')
    expect(needsSpanishName(valenciaPhoton())).toBe(false)
  })

  it('los resultados de la búsqueda con Enter (Nominatim, en español) también se recuerdan', () => {
    const fromEnter = placeFromNominatim({ place_id: 2, osm_type: 'relation', osm_id: 346558, lat: '39.6172', lon: '-0.3028', category: 'place', type: 'town', name: 'Puzol', display_name: 'Puzol, Valencia, España' })
    rememberSpanishName(fromEnter)
    const photon = placeFromPhoton({
      geometry: { coordinates: [-0.3028, 39.6172] },
      properties: { name: 'Puçol', osm_key: 'place', osm_value: 'town', type: 'city', osm_type: 'R', osm_id: 346558 } as never,
    })!
    expect(photon.name).toBe('Puzol')
  })

  it('las calles y los comercios no se traducen (solo municipios, regiones y países)', () => {
    const calle = placeFromPhoton({
      geometry: { coordinates: [-0.37, 39.47] },
      properties: { name: 'Carrer de Colón', osm_key: 'highway', osm_value: 'primary', type: 'street', osm_type: 'W', osm_id: 5 } as never,
    })!
    expect(needsSpanishName(calle)).toBe(false)
  })
})

describe('calles con el mismo nombre en zonas distintas', () => {
  const way = (id: number, lat: number, lng: number, name: string): OsmWay => ({
    type: 'way', id, nodes: [id * 10, id * 10 + 1],
    geometry: [{ lat, lon: lng }, { lat: lat + 0.0005, lon: lng }],
    tags: { highway: 'residential', name },
  })

  it('la Calle Mayor de dos pueblos son dos resultados, cada uno en su sitio; los tramos cercanos, uno', () => {
    networkStore.addWays([
      way(1, 39.419, -0.791, 'Calle Mayor'), // Buñol
      way(2, 39.4195, -0.7905, 'Calle Mayor'), // otro tramo, 70 m
      way(3, 39.617, -0.303, 'Calle Mayor'), // Puçol, ~47 km
    ])
    const found = searchLocal('calle mayor', [], { lat: 39.419, lng: -0.791 })
    expect(found).toHaveLength(2)
    expect(found.map((p) => Math.round(p.distanceMeters! / 1000))).toEqual([0, 47])
  })
})
