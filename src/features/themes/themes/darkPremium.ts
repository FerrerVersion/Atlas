import { defineTheme, FONT, roads } from './helpers'

export const darkPremium = defineTheme({
  id: 'dark-premium',
  name: 'Oscuro Premium',
  description: 'Fondo grafito, calles discretas, autopistas ámbar y ruta en cian eléctrico. Ideal de noche.',
  category: 'dark',
  colors: {
    background: '#0e1116', water: '#0b1d2c', parks: '#13231a', buildings: '#1b1f27', roads: '#3a404d', highways: '#f59e0b', labels: '#cbd5e1',
    labelHalo: '#0e1116', accent: '#22d3ee',
  },
  typography: { fontFamily: FONT.sans, labelSize: 12, labelWeight: 500 },
  detail: 'medium',
  base: { provider: 'esri-dark-gray' },
  labels: { provider: 'esri-dark-gray-labels', maxZoom: 15 },
  overlay: {
    enabled: true,
    opacity: 0.85,
    customLabels: true,
    classes: roads({
      highway: { color: '#f59e0b', width: 3.2, opacity: 0.9 },
      major: { color: '#6b7280', width: 2.4 },
      minor: { color: '#4b5563', width: 1.6 },
      local: { color: '#374151', width: 1.1 },
      path: { color: '#2b303b', width: 0.8, dash: '2 3' },
    }),
  },
  route: { color: '#22d3ee', casing: '#083344', width: 6, glow: true },
  marker: { shape: 'glow', color: '#22d3ee', textColor: '#0e1116' },
  effects: { glow: true, animations: false },
  poi: { style: 'outline', size: 28 },
  isDark: true,
})
