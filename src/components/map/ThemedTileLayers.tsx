import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { TILE_PROVIDERS } from '@/features/map/tileProviders'
import { PANES } from '@/features/map/mapTypes'
import type { MapTheme, TileLayerSpec } from '@/features/themes/themeTypes'

/** Anillos de teselas extra alrededor de la pantalla (se cargan después de las visibles). */
export const EDGE_BUFFER_TILES = 1

/**
 * Capa de teselas que también carga un margen fuera de la pantalla: al desplazar el
 * mapa ya están listas. Leaflet ordena la cola por cercanía al centro, así que lo
 * visible sigue llegando primero.
 */
type GridInternals = { _getTiledPixelBounds(center: L.LatLng): L.Bounds }
const BufferedTileLayer = L.TileLayer.extend({
  _getTiledPixelBounds(this: L.TileLayer & GridInternals, center: L.LatLng) {
    const bounds = (L.TileLayer.prototype as unknown as GridInternals)._getTiledPixelBounds.call(this, center)
    const pad = EDGE_BUFFER_TILES * this.getTileSize().x
    return L.bounds(bounds.min!.subtract([pad, pad]), bounds.max!.add([pad, pad]))
  },
}) as unknown as new (url: string, options: L.TileLayerOptions) => L.TileLayer

function createTileLayer(spec: TileLayerSpec, pane?: string) {
  const p = TILE_PROVIDERS[spec.provider]
  // En pantallas retina Leaflet pide teselas de un nivel más (zoomOffset +1): hay que
  // bajar el zoom nativo máximo para no pedir niveles que el servidor no tiene
  // (Esri Canvas devuelve «Map data not yet available» por encima del 16).
  const retina = !spec.pixelated && L.Browser.retina
  const layer = new BufferedTileLayer(p.url, {
    // Carga también mientras se arrastra (en móvil Leaflet esperaba a soltar el dedo)
    // y conserva más teselas al alejarse de una zona.
    updateWhenIdle: false,
    updateInterval: 150,
    keepBuffer: 4,
    attribution: p.attribution,
    subdomains: p.subdomains ?? 'abc',
    maxNativeZoom: p.maxNativeZoom - (spec.pixelated || retina ? 1 : 0),
    // Leaflet resta 1 a maxZoom en modo retina: se compensa para ocultar la capa al mismo zoom.
    maxZoom: (spec.maxZoom ?? 20) + (retina ? 1 : 0),
    opacity: spec.opacity ?? 1,
    // Efecto pixelado: teselas de un nivel inferior escaladas al doble.
    tileSize: spec.pixelated ? 512 : 256,
    zoomOffset: spec.pixelated ? -1 : 0,
    detectRetina: retina,
    className: spec.pixelated ? 'tiles-pixelated' : '',
    crossOrigin: true,
    pane: pane ?? 'tilePane',
  })
  layer.on('add', () => {
    const c = layer.getContainer()
    if (c) c.style.filter = spec.filter ?? ''
  })
  return layer
}

/**
 * Teselas base y de etiquetas del tema activo. Solo cambia la apariencia:
 * no toca vista, ruta ni datos.
 */
export function ThemedTileLayers({ theme, showLabels }: { theme: MapTheme; showLabels: boolean }) {
  const map = useMap()

  useEffect(() => {
    for (const pane of Object.values(PANES)) {
      if (!map.getPane(pane.name)) {
        const el = map.createPane(pane.name)
        el.style.zIndex = String(pane.zIndex)
        el.style.pointerEvents = 'none'
      }
    }
  }, [map])

  useEffect(() => {
    if (!theme.base) return
    const layer = createTileLayer(theme.base).addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, theme.base])

  useEffect(() => {
    if (!theme.labels || !showLabels) return
    const layer = createTileLayer(theme.labels, PANES.tileLabels.name).addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, theme.labels, showLabels])

  return null
}
