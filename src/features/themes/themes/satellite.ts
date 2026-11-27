import { defineTheme, FONT, roads } from './helpers'

export const satellite = defineTheme({
  id: 'satellite',
  name: 'Satélite',
  description: 'Imagen aérea de Esri World Imagery con calles reales de OSM superpuestas y etiquetas opcionales.',
  category: 'realistic',
  colors: {
    background: '#1f2a1c', water: '#163a52', parks: '#3d5a2a', buildings: '#8a8172', roads: '#f8fafc', highways: '#facc15', labels: '#ffffff',
    labelHalo: '#000000', accent: '#22d3ee',
  },
  typography: { fontFamily: FONT.sans, labelSize: 12, labelWeight: 600 },
  detail: 'medium',
  base: { provider: 'esri-imagery' },
  labels: { provider: 'esri-dark-gray-labels', maxZoom: 15 },
  overlay: {
    enabled: true,
    opacity: 0.7,
    customLabels: true,
    classes: roads({
      highway: { color: '#facc15', width: 3.5 },
      major: { color: '#fde68a', width: 2.5 },
      minor: { color: '#f8fafc', width: 1.6, opacity: 0.8 },
      local: { color: '#f8fafc', width: 1.1, opacity: 0.55 },
      path: { color: '#f8fafc', width: 0.8, opacity: 0.35, dash: '2 4' },
    }),
  },
  route: { color: '#22d3ee', casing: '#0f172a', width: 7 },
  marker: { shape: 'pin', color: '#f43f5e', textColor: '#ffffff' },
  effects: { glow: false, animations: false },
  poi: { style: 'filled', size: 30 },
  isDark: true,
})
