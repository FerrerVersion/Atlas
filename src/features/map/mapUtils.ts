import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import { ICONS } from './icons'
import { POI_CATEGORY_MAP, type PoiCategory } from '@/features/poi/poiTypes'
import type { MapTheme } from '@/features/themes/themeTypes'
import type { CSSProperties } from 'react'

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Variables CSS que exponen el tema al resto de estilos (marcadores, etiquetas, efectos). */
export function themeCssVars(theme: MapTheme): CSSProperties {
  return {
    '--map-bg': theme.colors.background,
    '--map-accent': theme.colors.accent,
    '--map-font': theme.typography.fontFamily,
    '--label-size': `${theme.typography.labelSize}px`,
    '--label-weight': theme.typography.labelWeight,
    '--label-spacing': theme.typography.letterSpacing ?? '0',
    '--label-transform': theme.typography.uppercase ? 'uppercase' : 'none',
    '--label-color': theme.colors.labels,
    '--label-halo': theme.colors.labelHalo,
    '--route-color': theme.route.color,
    '--marker-color': theme.marker.color,
    '--marker-text': theme.marker.textColor,
    '--poi-size': `${theme.poi.size}px`,
  } as CSSProperties
}

export function themeFxClasses(theme: MapTheme): string {
  return [
    `theme-${theme.id}`,
    theme.isDark ? 'is-dark' : '',
    theme.effects.glow ? 'fx-glow' : '',
    theme.effects.hueCycle ? 'fx-hue-cycle' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const iconCache = new Map<string, string>()
export function iconSvg(name: string): string {
  let svg = iconCache.get(name)
  if (!svg) {
    const Icon = ICONS[name] ?? ICONS.MapPin
    svg = renderToStaticMarkup(createElement(Icon, { strokeWidth: 2.2, 'aria-hidden': true }))
    iconCache.set(name, svg)
  }
  return svg
}

/** Marcador de parada con la forma propia del tema. */
export function waypointIcon(theme: MapTheme, label: string, kind: 'origin' | 'stop' | 'destination') {
  const color =
    kind === 'origin' ? theme.route.color : kind === 'destination' ? theme.marker.color : theme.colors.accent
  return L.divIcon({
    className: 'atlas-marker',
    html: `<div class="mk mk-${theme.marker.shape}" style="--c:${color}"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: theme.marker.shape === 'pin' ? [17, 34] : [17, 17],
  })
}

export function poiIcon(theme: MapTheme, category: PoiCategory, selected: boolean) {
  const def = POI_CATEGORY_MAP[category]
  const size = theme.poi.size
  return L.divIcon({
    className: 'atlas-marker',
    html: `<div class="poi poi-${theme.poi.style}${selected ? ' is-selected' : ''}" style="--c:${def.color}">${iconSvg(def.icon)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export const userIcon = (navigating: boolean) =>
  L.divIcon({
    className: 'atlas-marker',
    html: navigating ? `<div class="nav-puck">${iconSvg('Navigation')}</div>` : '<div class="user-dot pulse"></div>',
    iconSize: navigating ? [28, 28] : [20, 20],
    iconAnchor: navigating ? [14, 14] : [10, 10],
  })

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
