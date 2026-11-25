import { defineTheme, FONT, NO_OVERLAY } from './helpers'

export const minimal = defineTheme({
  id: 'minimal',
  name: 'Minimalista',
  description: 'Escala de grises, sin decoración y con la máxima legibilidad: solo lo esencial.',
  category: 'classic',
  colors: {
    background: '#fafafa', water: '#e5e7eb', parks: '#f1f5f1', buildings: '#f4f4f5', roads: '#ffffff',
    mainRoads: '#d4d4d8', highways: '#a1a1aa', route: '#111827', routeCasing: '#ffffff', labels: '#3f3f46',
    labelHalo: '#ffffff', markers: '#111827', accent: '#111827',
  },
  typography: { fontFamily: FONT.sans, labelSize: 11, labelWeight: 500, letterSpacing: '0.01em' },
  detail: 'low',
  base: { provider: 'esri-light-gray', filter: 'grayscale(1) contrast(0.92) brightness(1.04)' },
  labels: { provider: 'esri-light-gray-labels', opacity: 0.9, filter: 'grayscale(1)', maxZoom: 15 },
  overlay: { ...NO_OVERLAY, customLabels: true },
  route: { color: '#111827', casing: '#ffffff', width: 5 },
  marker: { shape: 'dot', color: '#111827', textColor: '#ffffff' },
  effects: { glow: false, shadows: false, animations: false },
  poi: { style: 'outline', size: 24 },
  isDark: false,
})
