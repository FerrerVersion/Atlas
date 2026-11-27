import type { TileProviderId } from '@/features/map/tileProviders'
import type { RoadClass } from '@/features/routing/routeTypes'

export type ThemeCategory = 'classic' | 'realistic' | 'dark' | 'futuristic' | 'creative'

export interface TileLayerSpec {
  provider: TileProviderId
  opacity?: number
  /** Filtro CSS aplicado a las teselas (recoloreado ráster). */
  filter?: string
  /** Oculta la capa por encima de este zoom (p. ej. cuando el tema dibuja sus propias etiquetas). */
  maxZoom?: number
  /** Escala teselas de menor zoom para un efecto pixelado. */
  pixelated?: boolean
}

export interface RoadStyle {
  color: string
  width: number
  opacity?: number
  dash?: string
  casing?: string
  casingWidth?: number
}

export type MarkerShape = 'pin' | 'dot' | 'diamond' | 'pixel' | 'glow' | 'seal' | 'crosshair' | 'blob'

export interface MapTheme {
  id: string
  name: string
  description: string
  category: ThemeCategory
  colors: {
    background: string
    water: string
    parks: string
    buildings: string
    roads: string
    highways: string
    labels: string
    labelHalo: string
    accent: string
  }
  typography: {
    fontFamily: string
    labelSize: number
    labelWeight: number
    uppercase?: boolean
    letterSpacing?: string
  }
  /** Nivel de detalle de la capa vectorial propia. */
  detail: 'low' | 'medium' | 'high'
  base: TileLayerSpec | null
  labels: TileLayerSpec | null
  overlay: {
    enabled: boolean
    opacity: number
    classes: Record<RoadClass, RoadStyle>
    /** Dibuja nodos/intersecciones del grafo. */
    showNodes?: boolean
    nodeColor?: string
    /** Etiquetas de calle propias (con la tipografía del tema) a partir de datos OSM. */
    customLabels?: boolean
  }
  route: {
    color: string
    casing: string
    width: number
    dash?: string
    animated?: boolean
    glow?: boolean
  }
  marker: { shape: MarkerShape; color: string; textColor: string }
  effects: {
    glow: boolean
    animations: boolean
    scanlines?: boolean
    grid?: boolean
    vignette?: boolean
    paper?: boolean
  }
  /** Iconos de POI: estilo de la burbuja. */
  poi: { style: 'filled' | 'outline' | 'neon' | 'pixel' | 'ink'; size: number }
  /** El tema es oscuro (los controles flotantes se adaptan). */
  isDark: boolean
}
