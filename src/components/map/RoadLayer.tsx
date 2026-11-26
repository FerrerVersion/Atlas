import { useEffect, useState } from 'react'
import { useMap, useMapEvent } from 'react-leaflet'
import { useSettledMove } from '@/hooks/useSettledMove'
import L from 'leaflet'
import { networkStore, useNetworkVersion } from '@/features/osm/networkStore'
import { MIN_OVERLAY_ZOOM, NODE_MIN_ZOOM, PANES, REGIONAL_MIN_ZOOM } from '@/features/map/mapTypes'
import { roadClass, toRoadType } from '@/features/routing/graph'
import type { RoadClass } from '@/features/routing/routeTypes'
import type { MapTheme } from '@/features/themes/themeTypes'

const DRAW_ORDER: RoadClass[] = ['path', 'local', 'minor', 'major', 'highway']

/** Clases visibles según zoom y nivel de detalle del tema. */
function visibleClasses(theme: MapTheme, zoom: number): Set<RoadClass> {
  const set = new Set<RoadClass>(['highway'])
  if (zoom >= 10) set.add('major')
  if (zoom >= 13) set.add('minor')
  if (zoom >= (theme.detail === 'low' ? 16 : 14)) set.add('local')
  if (zoom >= (theme.detail === 'high' ? 15 : 17)) set.add('path')
  return set
}

/** Grosor relativo de las líneas según el zoom (finas en la vista regional). */
function lineScale(zoom: number) {
  if (zoom >= 17) return 1.6
  if (zoom >= 16) return 1.3
  if (zoom >= 15) return 1.1
  if (zoom >= MIN_OVERLAY_ZOOM) return 0.85
  return zoom >= 10 ? 0.6 : 0.45
}

/**
 * Capa vectorial de calles REALES (OSM) dibujada con el estilo del tema.
 * Usa canvas para rendimiento; la geometría nunca se altera.
 */
export function RoadLayer({ theme }: { theme: MapTheme }) {
  const map = useMap()
  const version = useNetworkVersion()
  const [zoom, setZoom] = useState(() => Math.round(map.getZoom()))
  useMapEvent('zoomend', () => setZoom(Math.round(map.getZoom())))
  const bucket = zoom < REGIONAL_MIN_ZOOM ? 0 : Math.min(zoom, 17)

  useEffect(() => {
    const overlay = theme.overlay
    if (!overlay.enabled || bucket === 0 || networkStore.size === 0) return
    const renderer = L.canvas({ pane: PANES.roads.name, padding: 0.4 })
    const group = L.layerGroup()
    const classes = visibleClasses(theme, bucket)
    const scale = lineScale(bucket)

    const byClass = new Map<RoadClass, L.LatLngExpression[][]>()
    for (const w of networkStore.allWays()) {
      const t = toRoadType(w.tags.highway)
      if (!t) continue
      const c = roadClass(t)
      if (!classes.has(c)) continue
      let lines = byClass.get(c)
      if (!lines) byClass.set(c, (lines = []))
      lines.push(w.geometry.map((p) => [p.lat, p.lon] as L.LatLngTuple))
    }

    // Primero todas las «carcasas», luego los trazos, para cruces limpios.
    for (const pass of ['casing', 'line'] as const) {
      for (const c of DRAW_ORDER) {
        const lines = byClass.get(c)
        const st = overlay.classes[c]
        if (!lines?.length || !st || st.width <= 0) continue
        if (pass === 'casing' && !st.casing) continue
        L.polyline(lines, {
          renderer,
          interactive: false,
          color: pass === 'casing' ? st.casing : st.color,
          weight: (st.width + (pass === 'casing' ? (st.casingWidth ?? 1) * 2 : 0)) * scale,
          opacity: (st.opacity ?? 1) * overlay.opacity,
          dashArray: pass === 'line' ? st.dash : undefined,
          lineCap: theme.marker.shape === 'pixel' ? 'square' : 'round',
          lineJoin: theme.marker.shape === 'pixel' ? 'miter' : 'round',
          smoothFactor: bucket >= MIN_OVERLAY_ZOOM ? 1.2 : 2,
        }).addTo(group)
      }
    }
    group.addTo(map)
    return () => {
      group.remove()
      renderer.remove()
    }
  }, [map, theme, version, bucket])

  return theme.overlay.showNodes ? <GraphNodes theme={theme} zoom={zoom} /> : null
}

/** Intersecciones del grafo (estilos técnicos como Blueprint). */
function GraphNodes({ theme, zoom }: { theme: MapTheme; zoom: number }) {
  const map = useMap()
  const version = useNetworkVersion()
  const tick = useSettledMove()

  useEffect(() => {
    if (zoom < NODE_MIN_ZOOM || networkStore.size === 0) return
    const bounds = map.getBounds().pad(0.2)
    const renderer = L.canvas({ pane: PANES.nodes.name })
    const group = L.layerGroup()
    const graph = networkStore.graph('car')
    let n = 0
    for (const node of graph.nodes.values()) {
      if (node.type !== 'intersection' || !bounds.contains([node.lat, node.lng])) continue
      if (++n > 1500) break
      L.circleMarker([node.lat, node.lng], {
        renderer,
        radius: zoom >= 17 ? 3.5 : 2.5,
        color: theme.overlay.nodeColor ?? theme.colors.accent,
        weight: 1.2,
        fillColor: theme.colors.background,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group)
    }
    group.addTo(map)
    return () => {
      group.remove()
      renderer.remove()
    }
  }, [map, theme, version, zoom, tick])

  return null
}
