import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  // Pocas instancias: los tests usan mapas y builds reales y son sensibles a la carga de CPU.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // El service worker de la PWA saltaría los mocks de red de las pruebas.
    serviceWorkers: 'block',
    // La app exige la ubicación antes de nada: por defecto se concede (centro de Buñol,
    // la zona del extracto real de OSM que usan las pruebas).
    permissions: ['geolocation'],
    geolocation: { latitude: 39.4189, longitude: -0.7909, accuracy: 20 },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
