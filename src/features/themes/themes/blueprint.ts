import { defineTheme, FONT, roads } from './helpers'

export const blueprint = defineTheme({
  id: 'blueprint',
  name: 'Blueprint',
  description: 'Plano técnico de ingeniería urbana: trazos blancos, rejilla, nodos e intersecciones visibles.',
  category: 'futuristic',
  colors: {
    background: '#0b3a6e', water: '#0a2f59', parks: '#0d4278', buildings: '#114a85', roads: '#bfdbfe',
    mainRoads: '#e0f2fe', highways: '#ffffff', route: '#fde047', routeCasing: '#0b3a6e', labels: '#e0f2fe',
    labelHalo: '#0b3a6e', markers: '#fde047', accent: '#7dd3fc',
  },
  typography: { fontFamily: FONT.mono, labelSize: 10, labelWeight: 500, uppercase: true, letterSpacing: '0.14em' },
  detail: 'high',
  base: { provider: 'esri-dark-gray', filter: 'sepia(1) hue-rotate(175deg) saturate(3) brightness(0.62) contrast(1.4)' },
  labels: { provider: 'esri-dark-gray-labels', filter: 'grayscale(1) brightness(1.7)', maxZoom: 15 },
  overlay: {
    enabled: true,
    opacity: 0.9,
    showNodes: true,
    nodeColor: '#e0f2fe',
    customLabels: true,
    classes: roads({
      highway: { color: '#ffffff', width: 2.6 },
      major: { color: '#e0f2fe', width: 2 },
      minor: { color: '#bfdbfe', width: 1.4 },
      local: { color: '#93c5fd', width: 1 },
      path: { color: '#60a5fa', width: 0.7, dash: '4 3' },
    }),
  },
  route: { color: '#fde047', casing: '#0b3a6e', width: 4, dash: '10 6' },
  marker: { shape: 'crosshair', color: '#fde047', textColor: '#0b3a6e' },
  effects: { glow: false, shadows: false, animations: false, grid: true },
  poi: { style: 'outline', size: 26 },
  isDark: true,
})
