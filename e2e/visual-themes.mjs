// Script manual (no es un test): captura cada estilo con teselas reales.
// Uso: node e2e/visual-themes.mjs <dirSalida>   (requiere `npx vite preview --port 4173`)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const out = process.argv[2] ?? 'test-results/themes'
const data = resolve(import.meta.dirname, '../src/data')
const roads = JSON.parse(readFileSync(resolve(data, 'demoRoads.json'), 'utf8'))
const ids = ['classic','satellite','dark-premium','minimal','cyberpunk','open-world','blueprint','retro-arcade','fantasy','chaos','vintage','noir','topographic','hand-drawn','holographic']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
await page.route(/overpass|maps\.mail\.ru/, (r) => r.fulfill({ json: roads }))
await page.addInitScript(() => {
  localStorage.setItem('atlas-nav:prefs', JSON.stringify({ state: { lastView: { lat: 39.4185, lng: -0.7925, zoom: 16 }, themeId: 'classic' }, version: 1 }))
})
await page.goto('http://localhost:4173/')
await page.getByRole('tab', { name: 'Ajustes' }).click()
await page.getByRole('button', { name: /Cargar demo offline/ }).click()
await page.waitForTimeout(1500)
// Ruta real entre dos puntos del extracto mediante el menú del mapa.
const map = page.locator('.leaflet-container')
const box = await map.boundingBox()
for (const [fx, fy, label] of [[0.55, 0.3, 'Ruta desde aquí'], [0.8, 0.75, 'Ruta hasta aquí']]) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  await page.getByRole('menuitem', { name: label }).click()
  await page.waitForTimeout(400)
}
await page.waitForSelector('[data-testid=route-duration]', { timeout: 20000 })
for (const id of ids) {
  await page.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem('atlas-nav:prefs'))
    raw.state.themeId = id
    localStorage.setItem('atlas-nav:prefs', JSON.stringify(raw))
    window.dispatchEvent(new StorageEvent('storage', { key: 'atlas-nav:prefs' }))
  }, id)
  await page.getByRole('tab', { name: 'Estilos' }).click()
  const article = page.locator('article', { has: page.locator('h4', { hasText: new RegExp(`^${{'classic':'Clásico','satellite':'Satélite','dark-premium':'Oscuro Premium','minimal':'Minimalista','cyberpunk':'Cyberpunk','open-world':'Mundo Abierto','blueprint':'Blueprint','retro-arcade':'Retro Arcade','fantasy':'Fantasía','chaos':'Caótico','vintage':'Vintage','noir':'Blanco y negro','topographic':'Topográfico','hand-drawn':'Dibujo a mano','holographic':'Holográfico'}[id]}`) }) })
  await article.getByRole('button').click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}/${id}.png` })
}
await browser.close()
console.log('ok')
