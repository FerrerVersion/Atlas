#!/usr/bin/env node
/**
 * Mide la velocidad percibida en las acciones más comunes (con servicios simulados
 * con latencias realistas y datos OSM reales de Buñol).
 * Uso: npx vite preview --port 4173 & node scripts/perf-ux.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const roads = readFileSync('src/data/demoRoads.json', 'utf8')
const pois = readFileSync('src/data/demoPOIs.json', 'utf8')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const LAT = { photon: 450, nominatim: 900, overpass: 1500 }

const b = await chromium.launch()
async function page({ slow = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' })
  await ctx.addInitScript(() => localStorage.setItem('atlas-nav:prefs', JSON.stringify({ state: { lastView: { lat: 39.4185, lng: -0.7915, zoom: 16 }, autoLocate: false }, version: 1 })))
  const p = await ctx.newPage()
  if (slow) {
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  await p.route(/photon/, async (r) => {
    await wait(LAT.photon)
    const q = new URL(r.request().url()).searchParams.get('q') ?? ''
    r.fulfill({ json: { features: q.toLowerCase().startsWith('bla') ? [{ geometry: { coordinates: [-0.79, 39.42] }, properties: { osm_id: 1, osm_type: 'W', osm_key: 'highway', osm_value: 'residential', name: 'Avenida de Vicente Blasco Ibáñez', city: 'Buñol' } }] : [] } })
  })
  await p.route(/nominatim/, async (r) => { await wait(LAT.nominatim); r.fulfill({ json: { place_id: 1, osm_type: 'way', osm_id: 1, lat: '39.42', lon: '-0.79', category: 'highway', type: 'residential', name: 'Calle real de prueba', display_name: 'Calle real de prueba, Buñol' } }) })
  await p.route(/overpass|mail\.ru/, async (r) => { await wait(LAT.overpass); const q = new URLSearchParams(r.request().postData() ?? '').get('data') ?? ''; r.fulfill({ contentType: 'application/json', body: q.includes('out center') ? pois : roads }) })
  return p
}

// 1. Primer pintado (móvil lento, primera visita)
{
  const p = await page({ slow: true })
  const t0 = Date.now()
  await p.goto('http://localhost:4173/', { waitUntil: 'commit' })
  await p.waitForLoadState('load')
  const fcp = await p.evaluate(() => (performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint') ?? performance.getEntriesByType('paint')[0])?.startTime ?? -1)
  await p.locator('.leaflet-container').waitFor()
  console.log(`Arranque móvil lento: primer pintado ${Math.round(fcp)} ms · mapa interactivo ${Date.now() - t0} ms`)
  await p.context().close()
}
// 2. Buscar: tiempo hasta ver la primera sugerencia
{
  const p = await page()
  await p.goto('http://localhost:4173/')
  await p.getByRole('tab', { name: 'Ajustes' }).click()
  await p.getByRole('button', { name: /Cargar demo offline/ }).click()
  await p.waitForTimeout(1500)
  const input = p.getByRole('combobox', { name: 'Buscar un lugar' })
  const t0 = Date.now()
  await input.fill('Blasco')
  await p.getByRole('option').first().waitFor()
  console.log(`Buscar «Blasco»: primera sugerencia en ${Date.now() - t0} ms (Photon tarda ${LAT.photon} ms)`)
  await p.context().close()
}
// 3. Ruta pulsando en el mapa (origen y destino)
{
  const p = await page()
  await p.goto('http://localhost:4173/')
  await p.waitForTimeout(800)
  const box = (await p.locator('.leaflet-container').boundingBox())
  const t0 = Date.now()
  await p.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.35)
  await p.getByRole('menuitem', { name: 'Ruta desde aquí' }).click()
  await p.waitForTimeout(200)
  await p.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.7)
  await p.getByRole('menuitem', { name: 'Ruta hasta aquí' }).click()
  const t1 = Date.now()
  await p.getByTestId('route-duration').waitFor({ timeout: 30000 })
  console.log(`Ruta con clics en el mapa: lista ${Date.now() - t1} ms tras el 2.º clic (total ${Date.now() - t0} ms; Nominatim ${LAT.nominatim} ms, Overpass ${LAT.overpass} ms)`)
  await p.context().close()
}
await b.close()
