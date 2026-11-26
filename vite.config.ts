/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run dev:movil`: HTTPS + red local, necesario para usar el GPS desde el móvil
// (los navegadores solo permiten la geolocalización en HTTPS o en localhost).
const mobile = process.env.ATLAS_MOBILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(mobile ? [basicSsl()] : [])],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: mobile ? true : undefined },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
