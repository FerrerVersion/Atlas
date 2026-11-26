/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:movil`: HTTPS + red local, necesario para usar el GPS desde el móvil
// (los navegadores solo permiten la geolocalización en HTTPS o en localhost).
const mobile = process.env.ATLAS_MOBILE === '1'

// Ruta base de la web publicada (GitHub Pages sirve la app en /<repositorio>/).
// En local sigue siendo la raíz.
const base = process.env.BASE_PATH ?? '/'

/**
 * La hoja de estilos deja de bloquear el primer pintado: la pantalla de arranque del
 * HTML se ve al instante y la app (main.tsx) espera a que los estilos estén aplicados.
 */
const nonBlockingCss = (): Plugin => ({
  name: 'atlas-css-no-bloqueante',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace(
        /<link rel="stylesheet"([^>]*)>/g,
        `<link rel="preload" as="style"$1 onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet"$1></noscript>`,
      ),
  },
})

export default defineConfig({
  base,
  plugins: [
    react(),
    nonBlockingCss(),
    tailwindcss(),
    ...(mobile ? [basicSsl()] : []),
    // PWA: la app y las teselas ya vistas se guardan en el dispositivo → las visitas
    // siguientes cargan casi al instante y el mapa visitado funciona sin conexión.
    VitePWA({
      registerType: 'autoUpdate',
      // Registro diferido: el script no bloquea el primer pintado.
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Atlas · Navegación',
        short_name: 'Atlas',
        description: 'Navegación con datos reales de OpenStreetMap, rutas A* y estilos de mapa.',
        lang: 'es',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: base,
        scope: base,
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
        navigateFallback: `${base}index.html`,
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
