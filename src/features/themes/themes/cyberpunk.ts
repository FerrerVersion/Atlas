import { defineTheme, FONT, roads } from './helpers'

export const cyberpunk = defineTheme({
  id: 'cyberpunk',
  name: 'Cyberpunk',
  description: 'Neón magenta, violeta y cian sobre la noche urbana. Ruta con pulso de energía y etiquetas futuristas.',
  category: 'futuristic',
  colors: {
    background: '#07010f', water: '#120a3a', parks: '#160629', buildings: '#1c0b33', roads: '#7c3aed', highways: '#22d3ee', labels: '#67e8f9',
    labelHalo: '#07010f', accent: '#e879f9',
  },
  typography: { fontFamily: FONT.orbitron, labelSize: 11, labelWeight: 600, uppercase: true, letterSpacing: '0.12em' },
  detail: 'high',
  base: { provider: 'esri-dark-gray', filter: 'hue-rotate(225deg) saturate(4) brightness(0.7) contrast(1.25)' },
  labels: {
    provider: 'esri-dark-gray-labels',
    filter: 'sepia(1) hue-rotate(140deg) saturate(6) brightness(1.3)',
    maxZoom: 15,
  },
  overlay: {
    enabled: true,
    opacity: 0.95,
    customLabels: true,
    classes: roads({
      highway: { color: '#22d3ee', width: 3.4 },
      major: { color: '#e879f9', width: 2.6 },
      minor: { color: '#c026d3', width: 1.8, opacity: 0.85 },
      local: { color: '#7c3aed', width: 1.2, opacity: 0.75 },
      path: { color: '#4c1d95', width: 0.8, dash: '1 4', opacity: 0.7 },
    }),
  },
  route: { color: '#22d3ee', casing: '#f0abfc', width: 6, animated: true, glow: true, dash: '14 10' },
  marker: { shape: 'glow', color: '#f0abfc', textColor: '#07010f' },
  effects: { glow: true, animations: true, scanlines: true },
  poi: { style: 'neon', size: 28 },
  isDark: true,
})
