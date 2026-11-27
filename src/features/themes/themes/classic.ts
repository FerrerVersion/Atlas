import { defineTheme, FONT, NO_OVERLAY } from './helpers'

export const classic = defineTheme({
  id: 'classic',
  name: 'Clásico',
  description: 'Mapa de navegación tradicional: fondo claro, vías principales destacadas y etiquetas legibles.',
  category: 'classic',
  colors: {
    background: '#f2efe9', water: '#aad3df', parks: '#c8e6b0', buildings: '#e0dcd5', roads: '#ffffff', highways: '#f59e0b', labels: '#374151',
    labelHalo: '#ffffff', accent: '#2563eb',
  },
  typography: { fontFamily: FONT.sans, labelSize: 12, labelWeight: 500 },
  detail: 'medium',
  base: { provider: 'osm' },
  labels: null,
  overlay: NO_OVERLAY,
  route: { color: '#2563eb', casing: '#1e3a8a', width: 6 },
  marker: { shape: 'pin', color: '#dc2626', textColor: '#ffffff' },
  effects: { glow: false, animations: false },
  poi: { style: 'filled', size: 30 },
  isDark: false,
})
