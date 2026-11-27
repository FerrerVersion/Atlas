import { defineTheme, FONT, roads } from './helpers'

export const fantasy = defineTheme({
  id: 'fantasy',
  name: 'Fantasía',
  description: 'Pergamino ilustrado: relieve topográfico real en tonos sepia, caminos a tinta y sellos de lacre.',
  category: 'creative',
  colors: {
    background: '#efe0bb', water: '#7fa7a0', parks: '#8f9f62', buildings: '#c9a978', roads: '#7c4a21', highways: '#4a2408', labels: '#3b2412',
    labelHalo: '#f5e7c4', accent: '#9f1239',
  },
  typography: { fontFamily: FONT.cinzel, labelSize: 12, labelWeight: 700, letterSpacing: '0.05em' },
  detail: 'medium',
  base: { provider: 'opentopomap', filter: 'sepia(0.9) saturate(0.75) hue-rotate(-12deg) brightness(1.05) contrast(0.95)' },
  labels: null,
  overlay: {
    enabled: true,
    opacity: 0.85,
    classes: roads({
      highway: { color: '#4a2408', width: 3.2 },
      major: { color: '#6b3a12', width: 2.4 },
      minor: { color: '#7c4a21', width: 1.8, dash: '7 3' },
      local: { color: '#8b5a2b', width: 1.3, dash: '5 3' },
      path: { color: '#8b5a2b', width: 1, dash: '1 4' },
    }),
  },
  route: { color: '#9f1239', casing: '#fef3c7', width: 5, dash: '12 8' },
  marker: { shape: 'seal', color: '#9f1239', textColor: '#fef3c7' },
  effects: { glow: false, animations: false, paper: true, vignette: true },
  poi: { style: 'ink', size: 30 },
  isDark: false,
})
