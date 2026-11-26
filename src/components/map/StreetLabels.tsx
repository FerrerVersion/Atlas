import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useSettledMove } from '@/hooks/useSettledMove'
import L from 'leaflet'
import { networkStore, useNetworkVersion } from '@/features/osm/networkStore'
import { PANES, STREET_LABEL_MIN_ZOOM } from '@/features/map/mapTypes'
import { escapeHtml } from '@/features/map/mapUtils'
import type { MapTheme } from '@/features/themes/themeTypes'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h

/**
 * Etiquetas de calle con la tipografía del tema, colocadas a lo largo de la vía.
 * Los textos son los nombres reales de OSM (`name`), nunca generados.
 */
export function StreetLabels({ theme }: { theme: MapTheme }) {
  const map = useMap()
  const version = useNetworkVersion()
  const tick = useSettledMove()

  useEffect(() => {
    if (!theme.overlay.customLabels || map.getZoom() < STREET_LABEL_MIN_ZOOM || networkStore.size === 0) return
    const b = map.getBounds()
    const view = { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }
    const size = map.getSize()
    const fontPx = theme.typography.labelSize
    const charW = fontPx * (theme.typography.uppercase ? 0.78 : 0.6)
    const placed: Rect[] = []
    const seen = new Map<string, L.Point[]>()
    const group = L.layerGroup()

    const candidates = networkStore
      .waysInBBox(view)
      .filter((w) => w.tags.name)
      .map((w) => {
        // Segmento más largo en pantalla de la vía.
        let best: { a: L.Point; b: L.Point; len: number } | null = null
        for (let i = 1; i < w.geometry.length; i++) {
          const a = map.latLngToContainerPoint([w.geometry[i - 1].lat, w.geometry[i - 1].lon])
          const c = map.latLngToContainerPoint([w.geometry[i].lat, w.geometry[i].lon])
          const len = a.distanceTo(c)
          if (!best || len > best.len) best = { a, b: c, len }
        }
        return { name: w.tags.name, best, rank: w.tags.highway }
      })
      .filter((c) => c.best && c.best.len > c.name.length * charW * 0.8)
      .sort((x, y) => y.best!.len - x.best!.len)

    for (const c of candidates) {
      if (placed.length >= 45) break
      const { a, b: e } = c.best!
      const mid = L.point((a.x + e.x) / 2, (a.y + e.y) / 2)
      if (mid.x < 20 || mid.y < 20 || mid.x > size.x - 20 || mid.y > size.y - 20) continue
      const prev = seen.get(c.name) ?? []
      if (prev.some((p) => p.distanceTo(mid) < 280)) continue
      let angle = (Math.atan2(e.y - a.y, e.x - a.x) * 180) / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180
      const w = c.name.length * charW
      const rad = (Math.abs(angle) * Math.PI) / 180
      const rect = {
        x: mid.x,
        y: mid.y,
        w: w * Math.cos(rad) + fontPx * Math.sin(rad) + 8,
        h: w * Math.sin(rad) + fontPx * Math.cos(rad) + 6,
      }
      if (placed.some((r) => overlaps(r, rect))) continue
      placed.push(rect)
      seen.set(c.name, [...prev, mid])
      L.marker(map.containerPointToLatLng(mid), {
        pane: PANES.streetLabels.name,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'street-label',
          html: `<span style="--rot:${angle.toFixed(1)}deg">${escapeHtml(c.name)}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(group)
    }
    group.addTo(map)
    return () => {
      group.remove()
    }
  }, [map, theme, version, tick])

  return null
}
