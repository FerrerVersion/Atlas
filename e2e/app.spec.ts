import { readFileSync } from 'node:fs'
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
  // Pasar por una parada nunca acorta la ruta (puede no alargarla si ya estaba de camino).
  const km = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * (t.includes('km') ? 1000 : 1)
  const withStop = (await page.getByTestId('route-distance').textContent())!.split(' · ')[0]
  expect(km(withStop)).toBeGreaterThanOrEqual(km(direct) - 50)
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
  // Cada marcador de POI lleva su icono dentro.
  await expect(page.locator('.poi svg').first()).toBeVisible()
})

test('editor de mapas personalizados: nodos, vías y ruta A*', async ({ page }) => {
  await page.goto('/custom')
  await expect(page.getByText(/no se envía a ningún servidor/)).toBeVisible()
  await page.locator('input[type=file][accept^="image"]').setInputFiles('e2e/assets/mapa-ficticio.png')
  const img = page.locator('img.leaflet-image-layer')
  await expect(img).toBeVisible()
  await page.waitForTimeout(500)
  const ib = (await img.boundingBox())!
  const s = ib.width / 900
  const pts = [[120, 330], [420, 300], [720, 330]]
  const click = (i: number) => page.mouse.click(ib.x + pts[i][0] * s, ib.y + pts[i][1] * s)

  await page.getByRole('radio', { name: 'Nodos' }).click()
  for (let i = 0; i < 3; i++) await click(i)
  await expect(page.getByRole('textbox', { name: /Nombre del nodo/ })).toHaveCount(3)

  await page.getByRole('radio', { name: 'Vías' }).click()
  await click(0)
  await click(1) // crea 0→1 y deja el 1 seleccionado
  await click(1) // vuelve a pulsar el 1: cancela (las vías no tapan los nodos)
  await expect(page.getByText(/Elige el nodo final/)).toHaveCount(0)
  await click(1)
  await click(2)
  await expect(page.getByText(/· ↔ ·/)).toHaveCount(2)

  await page.getByRole('radio', { name: 'Ruta' }).click()
  await click(0)
  await click(2)
  await expect(page.getByText(/Has llegado a tu destino/)).toBeVisible()
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

test.describe('pantallas retina', () => {
  test.use({ deviceScaleFactor: 2 })
  test('nunca pide teselas Esri por encima del zoom nativo (16)', async ({ page }) => {
    const zooms: number[] = []
    await page.route(/arcgisonline\.com/, (route) => {
      const m = route.request().url().match(/tile\/(\d+)\//)
      if (m) zooms.push(Number(m[1]))
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) })
    })
    await page.addInitScript(() =>
      localStorage.setItem('atlas-nav:prefs', JSON.stringify({ state: { themeId: 'blueprint', lastView: { lat: 39.4185, lng: -0.7915, zoom: 18 } }, version: 1 })),
    )
    await page.goto('/')
    await expect.poll(() => zooms.length).toBeGreaterThan(0)
    expect(Math.max(...zooms)).toBeLessThanOrEqual(16)
  })
})

test('arranca aunque las preferencias guardadas estén dañadas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() =>
    localStorage.setItem('atlas-nav:prefs', JSON.stringify({ state: { themeId: 'x', lastView: { lat: 'x', lng: null, zoom: 99 } }, version: 1 })),
  )
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-theme', 'classic')
  expect(errors).toEqual([])
})

test('Enter elige el primer resultado (p. ej. coordenadas)', async ({ page }) => {
  await page.goto('/')
  const input = page.getByRole('combobox', { name: 'Buscar un lugar' })
  await input.fill('39.4189, -0.7909')
  await expect(page.getByRole('option')).toHaveCount(1)
  await input.press('Enter')
  await expect(page.getByTestId('place-name')).toHaveText('39.41890, -0.79090')
})

test('mismo origen y destino: aviso claro en lugar de una ruta de 0 m', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /Cargar demo offline/ }).click()
  await page.getByRole('tab', { name: 'Ruta' }).click()
  for (const box of ['Origen', 'Destino']) {
    await page.getByRole('combobox', { name: box }).fill('Blasco')
    await page.getByRole('option', { name: /Blasco Ibáñez/ }).first().click()
  }
  await expect(page.getByTestId('route-error')).toContainText('mismo punto')
  await expect(page.getByRole('button', { name: 'Iniciar' })).toHaveCount(0)
})

test.describe('móvil pequeño (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })

  test('el desplegable de búsqueda no queda tapado por los controles del mapa', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Buscar un lugar' }).fill('Blasco')
    const option = page.getByRole('option', { name: /Blasco Ibáñez/ })
    await expect(option).toBeVisible()
    // El punto donde estaba el botón de estilos debe pertenecer al desplegable.
    const box = (await option.boundingBox())!
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[role=option]') !== null, [box.x + box.width - 20, box.y + box.height / 2])
    expect(hit).toBe(true)
    await option.click()
    await expect(page.getByTestId('place-name')).toHaveText('Avenida de Vicente Blasco Ibáñez')
  })

  test('la barra de navegación cabe y se puede salir', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Ajustes' }).click()
    await page.getByRole('button', { name: /Cargar demo offline/ }).click()
    await page.getByRole('tab', { name: 'Ruta' }).click()
    await page.getByRole('combobox', { name: 'Origen' }).fill('Blasco')
    await page.getByRole('option', { name: /Blasco Ibáñez/ }).first().click()
    await page.getByRole('combobox', { name: 'Destino' }).fill('Doctor Beltr')
    await page.getByRole('option', { name: /Doctor Beltrán/ }).first().click()
    await page.getByRole('button', { name: 'Iniciar' }).click()
    const hud = page.getByTestId('nav-hud')
    await expect(hud).toBeVisible()
    // El tiempo restante no se parte en varias líneas.
    const time = page.locator('.glass-strong p.text-lg').first()
    expect((await time.boundingBox())!.height).toBeLessThan(40)
    await expect(page.getByRole('button', { name: 'Cargar calles reales de esta zona' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Salir de la navegación' }).click({ timeout: 3000 })
    await expect(hud).toBeHidden()
  })

  test('un arrastre corto del asa no expande el panel', async ({ page }) => {
    await page.goto('/')
    const handle = page.getByRole('button', { name: 'Expandir panel' })
    const b = (await handle.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y - 40, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: 'Expandir panel' })).toBeVisible()
    // Un toque simple sí lo expande.
    await page.getByRole('button', { name: 'Expandir panel' }).click()
    await expect(page.getByRole('button', { name: 'Contraer panel' })).toBeVisible()
  })
})

test.describe('editor de mapas: casos límite', () => {
  async function loadImage(page: import('@playwright/test').Page) {
    await page.locator('input[type=file][accept^="image"]').setInputFiles('e2e/assets/mapa-ficticio.png')
    const img = page.locator('img.leaflet-image-layer')
    await expect(img).toBeVisible()
    await page.waitForTimeout(400)
    return (await img.boundingBox())!
  }

  test('JSON roto: mensaje comprensible', async ({ page }) => {
    await page.goto('/custom')
    await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{malo') })
    await expect(page.getByRole('alert')).toHaveText('El archivo no es un JSON válido.')
  })

  test('calibración: rechaza coordenadas imposibles y avisa de referencias inútiles', async ({ page }) => {
    await page.goto('/custom')
    const ib = await loadImage(page)
    const at = () => page.mouse.click(ib.x + ib.width * 0.3, ib.y + ib.height * 0.5)
    await at()
    await page.getByPlaceholder(/lat, lng/).fill('200, 500')
    await expect(page.getByRole('button', { name: 'Añadir referencia' })).toBeDisabled()
    await expect(page.getByText(/fuera de rango/)).toBeVisible()
    for (const c of ['39.40, -0.37', '39.41, -0.37']) {
      await page.getByPlaceholder(/lat, lng/).fill(c)
      await page.getByRole('button', { name: 'Añadir referencia' }).click()
      await at()
    }
    await expect(page.getByText(/no permiten calibrar/)).toBeVisible()
  })

  test('borrar un nodo elegido para la ruta no muestra errores técnicos', async ({ page }) => {
    await page.goto('/custom')
    const ib = await loadImage(page)
    const s = ib.width / 900
    const click = (x: number, y: number) => page.mouse.click(ib.x + x * s, ib.y + y * s)
    await page.getByRole('radio', { name: 'Nodos' }).click()
    await click(120, 330)
    await click(420, 300)
    await page.getByRole('radio', { name: 'Vías' }).click()
    await click(120, 330)
    await click(420, 300)
    await page.getByRole('radio', { name: 'Ruta' }).click()
    await click(120, 330)
    await click(420, 300)
    await expect(page.getByText('Has llegado a tu destino')).toBeVisible()
    await page.getByRole('radio', { name: 'Nodos' }).click()
    await page.getByRole('button', { name: 'Eliminar nodo 2' }).click()
    await page.getByRole('radio', { name: 'Ruta' }).click()
    await expect(page.getByText(/no existe en el grafo/)).toHaveCount(0)
  })

  test('importar un mapa sin imagen y añadirla conserva los nodos', async ({ page }) => {
    await page.goto('/custom')
    const json = {
      format: 'atlas-custom-map', version: 1, name: 'Sin imagen', fictional: true,
      calibration: { mode: 'manual', references: [] }, image: { width: 900, height: 600, fileName: 'x.png' },
      nodes: [{ id: 'a', name: 'Alfa', x: 120, y: 330 }, { id: 'b', name: 'Beta', x: 420, y: 300 }],
      roads: [{ id: 'r', from: 'a', to: 'b', name: 'Camino', roadType: 'residential', oneWay: false, speedLimit: 50 }],
      manualScale: 1, manualRotationDeg: 0,
    }
    await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) })
    await expect(page.getByRole('alert')).toContainText('se exportó sin imagen')
    await loadImage(page)
    await page.getByRole('radio', { name: 'Nodos' }).click()
    await expect(page.getByRole('textbox', { name: 'Nombre del nodo 1' })).toHaveValue('Alfa')
    await expect(page.getByRole('textbox', { name: /Nombre del nodo/ })).toHaveCount(2)
  })
})

test.describe('medición en tiempo real con el GPS', () => {
  test.use({ geolocation: { latitude: 0, longitude: 0 }, permissions: ['geolocation'] })

  test('el avance se mide en vivo y, si te desvías, recalcula desde tu posición', async ({ page, context }) => {
    test.setTimeout(90_000)
    // Misma ruta que calculará la app (mismo motor y mismos datos reales de Buñol).
    // Módulos del motor cargados en ejecución (Playwright resuelve el alias @/ con tsconfig.json).
    const load = (p: string) => import(p) as Promise<Record<string, (...a: any[]) => any>>
    const { buildGraphFromOsm, nearestNode } = await load('../src/features/routing/graph.ts')
    const { findRoute } = await load('../src/features/routing/astar.ts')
    const { pointAlong } = await load('../src/utils/geometry.ts')
    type Way = { tags: Record<string, string>; geometry: { lat: number; lon: number }[] }
    const demoRoads = (JSON.parse(readFileSync('src/data/demoRoads.json', 'utf8')) as { elements: Way[] }).elements
    const mid = (name: string) => {
      const w = demoRoads.find((x) => x.tags.name === name)!
      const p = w.geometry[Math.floor(w.geometry.length / 2)]
      return { lat: p.lat, lng: p.lon }
    }
    const g = buildGraphFromOsm(demoRoads)
    const A = mid('Avenida de Vicente Blasco Ibáñez')
    const B = mid('Avenida del Doctor Beltrán Báguena')
    const r = findRoute(g, nearestNode(g, A.lat, A.lng)!.node.id, nearestNode(g, B.lat, B.lng)!.node.id)
    if (!r.ok) throw new Error('ruta')
    const at = async (meters: number) => {
      const [latitude, longitude] = pointAlong(r.geometry, meters)
      await context.setGeolocation({ latitude, longitude, accuracy: 8 })
    }

    await at(0)
    await page.goto('/')
    await page.getByRole('tab', { name: 'Ajustes' }).click()
    await page.getByRole('button', { name: /Cargar demo offline/ }).click()
    await page.getByRole('tab', { name: 'Ruta' }).click()
    await page.getByRole('combobox', { name: 'Origen' }).fill('Blasco')
    await page.getByRole('option', { name: /Blasco Ibáñez/ }).first().click()
    await page.getByRole('combobox', { name: 'Destino' }).fill('Doctor Beltr')
    await page.getByRole('option', { name: /Doctor Beltrán/ }).first().click()
    await expect(page.getByTestId('route-duration')).toBeVisible()

    // Antes de pulsar «Iniciar» ya se mide en vivo si estás sobre la ruta.
    await at(r.distance * 0.3)
    await expect(page.getByTestId('live-summary')).toContainText('En ruta ahora')

    await page.getByRole('button', { name: 'Iniciar' }).click()
    await expect(page.getByTestId('live-gps')).toContainText('GPS ±8 m')
    const remaining = async () => (await page.locator('[data-testid=nav-hud] ~ div p.text-xs').first().innerText()).split(' · ')[0]
    await at(r.distance * 0.4)
    const before = await remaining()
    // Avance realista: una lectura cada ~0,6 s, recorriendo el 30 % de la ruta.
    for (let k = 1; k <= 12; k++) {
      await at(r.distance * (0.4 + (0.3 * k) / 12))
      await page.waitForTimeout(600)
    }
    await expect.poll(remaining).not.toBe(before)
    await expect(page.getByTestId('live-traveled')).not.toHaveText('0 m')
    // El marcador de posición se ve (con su flecha) y el mapa lo sigue dentro de la pantalla.
    const puck = page.locator('.nav-puck svg')
    await expect(puck).toBeVisible()
    await expect
      .poll(async () => {
        const b = await puck.boundingBox()
        const v = page.viewportSize()!
        return !!b && b.y > 0 && b.y < v.height && b.x > 0 && b.x < v.width
      })
      .toBe(true)
    const speed = Number((await page.getByTestId('live-speed').innerText()).replace(/\D/g, '') || 0)
    expect(speed).toBeLessThanOrEqual(250)

    // Fluidez: tras una lectura del GPS (1 s después de la anterior), el mapa acompaña a
    // la posición de forma continua durante casi todo el segundo, sin quedarse parado.
    await page.waitForTimeout(1000)
    const motion = page.evaluate(
      () =>
        new Promise<{ changes: number; lastChangeMs: number }>((resolve) => {
          const pane = document.querySelector('.leaflet-map-pane') as HTMLElement
          const t0 = performance.now()
          let prev = pane.style.transform
          let changes = 0
          let last = 0
          const tick = () => {
            const now = performance.now() - t0
            if (pane.style.transform !== prev) {
              changes++
              last = now
              prev = pane.style.transform
            }
            if (now < 1000) requestAnimationFrame(tick)
            else resolve({ changes, lastChangeMs: last })
          }
          requestAnimationFrame(tick)
        }),
    )
    await at(r.distance * 0.75) // ~60 m en 1 s (como un coche por ciudad)
    const m = await motion
    expect(m.changes).toBeGreaterThan(20) // decenas de fotogramas, no un salto
    expect(m.lastChangeMs).toBeGreaterThan(700) // sigue moviéndose casi hasta la siguiente lectura

    // Desvío: ~250 m al norte del punto actual durante más de 6 s → recalcula.
    const [lat, lng] = pointAlong(r.geometry, r.distance * 0.7)
    for (let i = 0; i < 4; i++) {
      await context.setGeolocation({ latitude: lat + 0.00225 + i * 0.00001, longitude: lng, accuracy: 8 })
      await page.waitForTimeout(2200)
    }
    await expect(page.getByTestId('live-gps')).toContainText(/Fuera de ruta|GPS/)
    await expect(page.getByText('Recalculando la ruta desde tu posición…')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Salir de la navegación' }).click()
    await expect(page.getByRole('combobox', { name: 'Origen' })).toHaveValue('Mi ubicación')
  })
})

test('al desplazar el mapa, las teselas del borde ya están cargadas (sin huecos)', async ({ page }) => {
  // Teselas lentas (0,4 s): sin margen precargado, lo que entra por el borde se vería en blanco.
  await page.unroute(/(tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org)/)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  await page.route(/(tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org)/, async (route) => {
    await new Promise((r) => setTimeout(r, 400))
    await route.fulfill({ status: 200, contentType: 'image/png', body: png })
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  const map = page.locator('.leaflet-container')
  const box = (await map.boundingBox())!
  // Arrastre de un cuarto de pantalla hacia la izquierda (entra mapa por la derecha).
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 6 })
  await page.mouse.up()
  const blank = await page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Puntos de la mitad derecha (la zona que acaba de entrar en pantalla).
    // Las teselas no reciben eventos (pointer-events: none): se comprueba por geometría.
    const loaded = [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded')].map((t) => t.getBoundingClientRect())
    let missing = 0
    for (let x = vw * 0.55; x < vw - 5; x += 60) {
      for (let y = 60; y < vh - 60; y += 80) {
        if (!loaded.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) missing++
      }
    }
    return missing
  })
  expect(blank).toBe(0)
})
