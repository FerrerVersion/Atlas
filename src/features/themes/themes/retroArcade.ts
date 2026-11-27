import { defineTheme, FONT, roads } from './helpers'

export const retroArcade = defineTheme({
  id: 'retro-arcade',
  name: 'Retro Arcade',
  description: 'Colores intensos, píxeles visibles, iconos pixelados y tipografía de recreativa clásica.',
  category: 'creative',
  colors: {
    background: '#120338', water: '#1d4ed8', parks: '#15803d', buildings: '#3b0764', roads: '#2563eb', highways: '#ef4444', labels: '#fde047',
    labelHalo: '#000000', accent: '#f472b6',
  },
  typography: { fontFamily: FONT.arcade, labelSize: 8, labelWeight: 400, uppercase: true },
  detail: 'medium',
  base: {
    provider: 'esri-dark-gray',
    filter: 'contrast(1.6) saturate(3) hue-rotate(210deg) brightness(0.9)',
    pixelated: true,
  },
  labels: { provider: 'esri-dark-gray-labels', filter: 'sepia(1) saturate(8) hue-rotate(10deg) brightness(1.3)', maxZoom: 15, pixelated: true },
  overlay: {
    enabled: true,
    opacity: 1,
    customLabels: true,
    classes: roads({
      highway: { color: '#ef4444', width: 5, casing: '#000000', casingWidth: 2 },
      major: { color: '#facc15', width: 4, casing: '#000000', casingWidth: 2 },
      minor: { color: '#22c55e', width: 3 },
      local: { color: '#2563eb', width: 2.4 },
      path: { color: '#a855f7', width: 1.5, dash: '4 4' },
    }),
  },
  route: { color: '#f472b6', casing: '#000000', width: 8, dash: '8 8', animated: true },
  marker: { shape: 'pixel', color: '#22c55e', textColor: '#000000' },
  effects: { glow: false, animations: true, scanlines: true },
  poi: { style: 'pixel', size: 28 },
  isDark: true,
})
