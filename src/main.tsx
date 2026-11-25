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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
