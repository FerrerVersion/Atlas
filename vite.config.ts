/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:movil`: HTTPS + red local, necesario para usar el GPS desde el móvil
// (los navegadores solo permiten la geolocalización en HTTPS o en localhost).
const mobile = process.env.ATLAS_MOBILE === '1'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(mobile ? [basicSsl()] : []),
    // PWA: la app y las teselas ya vistas se guardan en el dispositivo → las visitas
    // siguientes cargan casi al instante y el mapa visitado funciona sin conexión.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Atlas · Navegación',
        short_name: 'Atlas',
        description: 'Navegación con datos reales de OpenStreetMap, rutas A* y estilos de mapa.',
        lang: 'es',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La demo offline (300 kB) solo se descarga si se usa.
        // Tipografías: solo alfabetos latinos (los demás se bajan si alguna vez hacen falta).
        globPatterns: ['**/*.{js,css,html,svg}', 'pwa-192.png', '**/*-latin-*.woff2'],
        globIgnores: ['**/demo-*.js'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Teselas: primero la copia local (se renuevan a los 14 días).
            urlPattern: /^https:\/\/(tile\.openstreetmap\.org|server\.arcgisonline\.com|[abc]\.tile\.opentopomap\.org)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'atlas-teselas',
              expiration: { maxEntries: 3000, maxAgeSeconds: 14 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/demo-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'atlas-demo', expiration: { maxEntries: 2 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: mobile ? true : undefined },
  build: {
    rolldownOptions: {
      output: {
        // Librerías en paquetes propios: se descargan en paralelo y se quedan en
        // la caché del navegador aunque cambie el código de la app.
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/](react-router|@remix-run|cookie|set-cookie-parser)[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
