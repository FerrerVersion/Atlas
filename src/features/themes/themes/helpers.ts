import type { RoadClass } from '@/features/routing/routeTypes'
import type { MapTheme, RoadStyle } from '../themeTypes'

export const FONT = {
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  orbitron: 'Orbitron, "Inter Variable", sans-serif',
  arcade: '"Press Start 2P", monospace',
  cinzel: 'Cinzel, Georgia, serif',
  hand: 'Caveat, "Comic Sans MS", cursive',
  serif: 'Georgia, "Times New Roman", serif',
}

export const roads = (r: Record<RoadClass, RoadStyle>) => r

/** Capa vectorial desactivada (las teselas ya muestran las calles). */
export const NO_OVERLAY: MapTheme['overlay'] = {
  enabled: false,
  opacity: 0,
  classes: roads({
    highway: { color: '#000', width: 0 },
    major: { color: '#000', width: 0 },
    minor: { color: '#000', width: 0 },
    local: { color: '#000', width: 0 },
    path: { color: '#000', width: 0 },
  }),
}

export const defineTheme = (t: MapTheme): MapTheme => t
