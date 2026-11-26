import { expect, test } from '@playwright/test'
import { mockServices } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

async function openTab(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('tab', { name }).click()
}

test('carga el mapa interactivo con controles', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acercar' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Buscar un lugar' })).toBeVisible()
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
})

test('busca Buñol y muestra su nombre real', async ({ page }) => {
  await page.goto('/')
  const input = page.getByRole('combobox', { name: 'Buscar un lugar' })
  await input.fill('Buñol')
  const option = page.getByRole('option', { name: /Buñol.*Municipio/ })
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.getByTestId('place-name')).toHaveText('Buñol')
  await expect(page.getByText(/La Hoya de Buñol, Comunitat Valenciana, España/)).toBeVisible()
})

test('cambia de estilo sin perder la ruta y lo recuerda al recargar', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Ajustes')
  await page.getByRole('button', { name: /Cargar demo offline/ }).click()
  await openTab(page, 'Ruta')

  const origin = page.getByRole('combobox', { name: 'Origen' })
  await origin.fill('Blasco')
  await page.getByRole('option', { name: /Avenida de Vicente Blasco Ibáñez/ }).click()
  const dest = page.getByRole('combobox', { name: 'Destino' })
  await dest.fill('Doctor Beltr')
  await page.getByRole('option', { name: /Avenida del Doctor Beltrán Báguena/ }).click()

  await expect(page.getByTestId('route-duration')).toBeVisible({ timeout: 15_000 })
  // Solo la distancia (la hora de llegada cambia con el reloj).
  const distanceOf = async () => (await page.getByTestId('route-distance').textContent())!.split(' · ')[0]
  const distance = await distanceOf()
  await expect(page.getByTestId('instructions').locator('li').last()).toContainText('Has llegado a tu destino')
  await expect(page.locator('path.route-line')).toHaveCount(1)

  for (const name of ['Cyberpunk', 'Blueprint', 'Retro Arcade', 'Fantasía']) {
    await openTab(page, 'Estilos')
    await page.getByRole('heading', { name }).locator('xpath=ancestor::article').getByRole('button').click()
    await openTab(page, 'Ruta')
    await expect(page.getByTestId('route-distance')).toContainText(distance)
    expect(await distanceOf()).toBe(distance)
    await expect(page.locator('path.route-line')).toHaveCount(1)
  }
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-theme', 'fantasy')
  await page.reload()
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-theme', 'fantasy')
})

test('ruta con parada intermedia y modo navegación', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Ajustes')
  await page.getByRole('button', { name: /Cargar demo offline/ }).click()
  await openTab(page, 'Ruta')
  await page.getByRole('combobox', { name: 'Origen' }).fill('Blasco')
  await page.getByRole('option', { name: /Blasco Ibáñez/ }).first().click()
  await page.getByRole('combobox', { name: 'Destino' }).fill('Doctor Beltr')
  await page.getByRole('option', { name: /Doctor Beltrán/ }).first().click()
  await expect(page.getByTestId('route-duration')).toBeVisible({ timeout: 15_000 })
  const direct = (await page.getByTestId('route-distance').textContent())!.split(' · ')[0]

  await page.getByRole('button', { name: 'Añadir parada' }).click()
  await page.getByRole('combobox', { name: 'Parada 1' }).fill('Severo Ochoa')
  await page.getByRole('option', { name: /Calle de Severo Ochoa/ }).click()
  await expect(page.getByText('Tramo 2')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('route-distance')).not.toContainText(direct)
  await expect(page.getByTestId('instructions')).toContainText('Has llegado a la parada 1')

  await page.getByRole('button', { name: 'Iniciar' }).click()
  await expect(page.getByTestId('nav-hud')).toBeVisible()
  await page.getByRole('button', { name: 'Maniobra siguiente' }).click()
  await page.getByRole('button', { name: 'Salir de la navegación' }).click()
  await expect(page.getByTestId('nav-hud')).toBeHidden()
})

test('filtro de POIs muestra establecimientos reales', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Ajustes')
  await page.getByRole('button', { name: /Cargar demo offline/ }).click()
  await openTab(page, 'Explorar')
  await page.getByRole('button', { name: 'Restaurantes' }).click()
  await expect(page.getByText('Mesón del Castillo').first()).toBeVisible({ timeout: 10_000 })
})

test('editor de mapas personalizados', async ({ page }) => {
  await page.goto('/custom')
  await expect(page.getByRole('heading', { name: 'Mapas personalizados' })).toBeVisible()
  await expect(page.getByText(/no se envía a ningún servidor/)).toBeVisible()
})

test('el menú del mapa fija origen y destino y se cierra (sin nombres inventados)', async ({ page }) => {
  await page.goto('/')
  const box = (await page.locator('.leaflet-container').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4)
  await page.getByRole('menuitem', { name: 'Ruta desde aquí' }).click()
  await expect(page.locator('.leaflet-popup')).toHaveCount(0)
  // Nominatim (simulado) no devuelve nada: se muestran solo coordenadas.
  await expect(page.getByRole('combobox', { name: 'Origen' })).toHaveValue(/^Punto -?\d+\.\d{5}, -?\d+\.\d{5}$/)
})

test.describe('ubicación del dispositivo', () => {
  // Posición simulada: Plaça de l'Ajuntament (València).
  test.use({ geolocation: { latitude: 39.46975, longitude: -0.37739, accuracy: 25 }, permissions: ['geolocation'] })

  test('al abrir la web centra el mapa en la ubicación sin pulsar nada y la sigue', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.locator('.user-dot')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mi ubicación' })).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('atlas-nav:prefs')!).state.lastView.lat))
      .toBeCloseTo(39.4697, 2)
    // El seguimiento continúa: al moverse el dispositivo se actualiza el punto.
    await context.setGeolocation({ latitude: 39.4189, longitude: -0.7909 })
    await page.getByRole('button', { name: 'Mi ubicación' }).click()
    await expect
      .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('atlas-nav:prefs')!).state.lastView.lng))
      .toBeCloseTo(-0.7909, 2)
  })

  test('«Mi ubicación» centra el mapa y muestra el punto azul', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Mi ubicación' }).click()
    await expect(page.locator('.user-dot')).toBeVisible()
    await expect
      .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('atlas-nav:prefs')!).state.lastView))
      .toMatchObject({ zoom: 16 })
    const view = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-nav:prefs')!).state.lastView)
    expect(view.lat).toBeCloseTo(39.4697, 2)
    expect(view.lng).toBeCloseTo(-0.3774, 2)
  })

  test('se puede usar como origen de la ruta', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Ruta' }).click()
    await page.getByRole('button', { name: 'Usar mi ubicación como origen' }).click()
    await expect(page.getByRole('combobox', { name: 'Origen' })).toHaveValue('Mi ubicación')
  })
})

test.describe('ubicación denegada', () => {
  test.use({ permissions: [] })
  test('al abrir no molesta si se deniega, y avisa al pulsar el botón', async ({ page, context }) => {
    await context.clearPermissions()
    await page.goto('/')
    await page.waitForTimeout(800)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Mi ubicación' }).click()
    await expect(page.getByRole('alert')).toContainText(/ubicación/)
  })
})
