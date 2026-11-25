import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Las pruebas e2e no dependen de servicios externos: se responden con el
 * extracto REAL de OpenStreetMap incluido en el repositorio (Buñol).
 */
const dataDir = resolve(import.meta.dirname, '../src/data')
const roads = JSON.parse(readFileSync(resolve(dataDir, 'demoRoads.json'), 'utf8')) as {
  elements: { tags: Record<string, string>; geometry: { lat: number; lon: number }[] }[]
}
const pois = JSON.parse(readFileSync(resolve(dataDir, 'demoPOIs.json'), 'utf8'))

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

export async function mockServices(page: Page) {
  // Teselas: imagen vacía (evita tráfico a los servidores de teselas).
  await page.route(/(tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org)/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }),
  )
  // Photon: busca entre lugares/calles reales del extracto.
  await page.route(/photon\.komoot\.io/, (route) => {
    const q = norm(new URL(route.request().url()).searchParams.get('q') ?? '')
    const features: unknown[] = []
    if ('bunol'.startsWith(q) || q.startsWith('bunol')) {
      features.push({
        geometry: { coordinates: [-0.7909637, 39.4189582] },
        properties: {
          osm_id: 346693, osm_type: 'R', osm_key: 'place', osm_value: 'town', name: 'Buñol',
          county: 'La Hoya de Buñol', state: 'Comunitat Valenciana', country: 'España',
          extent: [-0.81, 39.43, -0.77, 39.41],
        },
      })
    }
    const seen = new Set<string>()
    for (const w of roads.elements) {
      const name = w.tags.name
      if (!name || seen.has(name) || !norm(name).includes(q)) continue
      seen.add(name)
      const mid = w.geometry[Math.floor(w.geometry.length / 2)]
      features.push({
        geometry: { coordinates: [mid.lon, mid.lat] },
        properties: { osm_id: features.length + 1, osm_type: 'W', osm_key: 'highway', osm_value: w.tags.highway, name, city: 'Buñol', country: 'España' },
      })
      if (features.length >= 6) break
    }
    return route.fulfill({ json: { features } })
  })
  // Nominatim: sin resultados (la app debe mostrar solo coordenadas, sin inventar nombres).
  await page.route(/nominatim\.openstreetmap\.org/, (route) =>
    route.fulfill({ json: route.request().url().includes('/reverse') ? { error: 'Unable to geocode' } : [] }),
  )
  // Overpass: red viaria o POIs reales del extracto.
  await page.route(/overpass|maps\.mail\.ru/, (route) => {
    const body = new URLSearchParams(route.request().postData() ?? '').get('data') ?? ''
    return route.fulfill({ json: body.includes('out center') ? pois : roads })
  })
}
