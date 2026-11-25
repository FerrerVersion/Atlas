import { defineTheme, FONT, roads } from './helpers'

export const chaos = defineTheme({
  id: 'chaos',
  name: 'Caótico / Experimental',
  description: 'Deliberadamente extravagante: colores que mutan, trazos discontinuos y marcadores que respiran. Opcional.',
  category: 'creative',
  colors: {
    background: '#fde047', water: '#06b6d4', parks: '#f43f5e', buildings: '#8b5cf6', roads: '#f43f5e',
    mainRoads: '#3b82f6', highways: '#22c55e', route: '#ff00e5', routeCasing: '#00ffd5', labels: '#111827',
    labelHalo: '#fde047', markers: '#ff00e5', accent: '#ff00e5',
  },
  typography: { fontFamily: FONT.hand, labelSize: 16, labelWeight: 700 },
  detail: 'high',
  base: { provider: 'osm', filter: 'saturate(3) contrast(1.2)' },
  labels: null,
  overlay: {
    enabled: true,
    opacity: 0.95,
    classes: roads({
      highway: { color: '#22c55e', width: 6, dash: '18 6' },
      major: { color: '#3b82f6', width: 4, dash: '2 6' },
      minor: { color: '#f97316', width: 3, dash: '10 4 2 4' },
      local: { color: '#f43f5e', width: 2 },
      path: { color: '#8b5cf6', width: 1.5, dash: '1 3' },
    }),
  },
  route: { color: '#ff00e5', casing: '#00ffd5', width: 9, dash: '4 12', animated: true, glow: true },
  marker: { shape: 'blob', color: '#ff00e5', textColor: '#ffffff' },
  effects: { glow: true, shadows: true, animations: true, hueCycle: true },
  poi: { style: 'neon', size: 34 },
  isDark: false,
})
