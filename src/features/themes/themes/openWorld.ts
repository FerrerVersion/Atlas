import { defineTheme, FONT, roads } from './helpers'

export const openWorld = defineTheme({
  id: 'open-world',
  name: 'Mundo Abierto',
  description: 'Estética de videojuego de mundo abierto: carreteras gruesas y contrastadas, colores saturados y viñeta inmersiva.',
  category: 'creative',
  colors: {
    background: '#d9e4c4', water: '#4fb3d9', parks: '#7cc46a', buildings: '#c9b99a', roads: '#ffffff',
    mainRoads: '#ffd166', highways: '#ff9f1c', route: '#a3e635', routeCasing: '#1a2e05', labels: '#1f2937',
    labelHalo: '#ffffff', markers: '#ff9f1c', accent: '#a3e635',
  },
  typography: { fontFamily: FONT.sans, labelSize: 12, labelWeight: 800, uppercase: true, letterSpacing: '0.06em' },
  detail: 'high',
  base: { provider: 'osm', filter: 'saturate(1.9) contrast(1.15) brightness(1.03)' },
  labels: null,
  overlay: {
    enabled: true,
    opacity: 1,
    classes: roads({
      highway: { color: '#ff9f1c', width: 5, casing: '#7c2d12', casingWidth: 2 },
      major: { color: '#ffd166', width: 4, casing: '#854d0e', casingWidth: 1.5 },
      minor: { color: '#ffffff', width: 3, casing: '#6b7280', casingWidth: 1 },
      local: { color: '#ffffff', width: 2, casing: '#9ca3af', casingWidth: 0.8 },
      path: { color: '#fef3c7', width: 1, dash: '3 3' },
    }),
  },
  route: { color: '#a3e635', casing: '#1a2e05', width: 8 },
  marker: { shape: 'diamond', color: '#ff9f1c', textColor: '#1f2937' },
  effects: { glow: false, shadows: true, animations: true, vignette: true },
  poi: { style: 'filled', size: 32 },
  isDark: false,
})
