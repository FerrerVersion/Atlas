import { defineTheme, FONT, NO_OVERLAY, roads } from './helpers'

export const topographic = defineTheme({
  id: 'topographic',
  name: 'Topográfico',
  description: 'Curvas de nivel y sombreado del relieve real (OpenTopoMap) para rutas por montaña.',
  category: 'realistic',
  colors: {
    background: '#f5f1e6', water: '#97c4e8', parks: '#bcd9a0', buildings: '#d6c8b4', roads: '#ffffff', highways: '#e8643a', labels: '#1f2937',
    labelHalo: '#ffffff', accent: '#dc2626',
  },
  typography: { fontFamily: FONT.sans, labelSize: 12, labelWeight: 500 },
  detail: 'medium',
  base: { provider: 'opentopomap' },
  labels: null,
  overlay: NO_OVERLAY,
  route: { color: '#dc2626', casing: '#ffffff', width: 6 },
  marker: { shape: 'pin', color: '#dc2626', textColor: '#ffffff' },
  effects: { glow: false, animations: false },
  poi: { style: 'filled', size: 28 },
  isDark: false,
})

export const handDrawn = defineTheme({
  id: 'hand-drawn',
  name: 'Dibujo a mano',
  description: 'Boceto en cuaderno: trazos irregulares a lápiz, papel y rotulación manuscrita.',
  category: 'creative',
  colors: {
    background: '#fbf8f1', water: '#bfdbfe', parks: '#d9f99d', buildings: '#f5f5f4', roads: '#334155', highways: '#0f172a', labels: '#1e293b',
    labelHalo: '#fbf8f1', accent: '#ef4444',
  },
  typography: { fontFamily: FONT.hand, labelSize: 17, labelWeight: 700 },
  detail: 'medium',
  base: { provider: 'esri-light-gray', filter: 'grayscale(0.7) contrast(0.85) brightness(1.05) sepia(0.15)', opacity: 0.6 },
  labels: { provider: 'esri-light-gray-labels', maxZoom: 15, filter: 'grayscale(1)' },
  overlay: {
    enabled: true,
    opacity: 0.85,
    customLabels: true,
    classes: roads({
      highway: { color: '#0f172a', width: 3, dash: '24 3 6 3' },
      major: { color: '#1e293b', width: 2.4, dash: '18 3 4 2' },
      minor: { color: '#334155', width: 1.8, dash: '14 2 3 2' },
      local: { color: '#475569', width: 1.3, dash: '10 2 2 2' },
      path: { color: '#64748b', width: 1, dash: '2 4' },
    }),
  },
  route: { color: '#ef4444', casing: '#fbf8f1', width: 5, dash: '20 4 2 4' },
  marker: { shape: 'pin', color: '#ef4444', textColor: '#ffffff' },
  effects: { glow: false, animations: false, paper: true },
  poi: { style: 'ink', size: 28 },
  isDark: false,
})
