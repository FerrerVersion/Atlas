import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/orbitron/600.css'
import '@fontsource/press-start-2p/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/caveat/700.css'
import './styles/globals.css'
import './styles/map.css'
import { App } from './app/App'

/** Espera a que las hojas de estilos (cargadas sin bloquear, ver vite.config.ts) estén aplicadas. */
function stylesReady(): Promise<unknown> {
  const pending = [...document.querySelectorAll<HTMLLinkElement>('link[as="style"]')].filter(
    (l) => !(l.rel === 'stylesheet' && l.sheet),
  )
  return Promise.all(
    pending.map(
      (link) =>
        new Promise<void>((resolve) => {
          link.addEventListener('load', () => resolve(), { once: true })
          link.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => new Promise((r) => requestAnimationFrame(r)))
}

stylesReady().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
