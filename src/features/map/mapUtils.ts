import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
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
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * SVG de cada icono, generados UNA vez al cargar el módulo. No se pueden generar
 * dentro del render de React (flushSync ahí no hace nada y devolvería «»), y los
 * marcadores los piden justo durante el render (useMemo).
 */
const ICON_SVG: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined') return out
  for (const [name, Icon] of Object.entries(ICONS)) {
    const host = document.createElement('div')
    const root = createRoot(host)
    flushSync(() => root.render(createElement(Icon, { strokeWidth: 2.2, 'aria-hidden': true })))
    out[name] = host.innerHTML
    root.unmount()
  }
  return out
})()

export function iconSvg(name: string): string {
  return ICON_SVG[name] ?? ICON_SVG.MapPin ?? ''
}

/** Marcador de parada con la forma propia del tema. */
export function waypointIcon(theme: MapTheme, label: string, kind: 'origin' | 'stop' | 'destination') {
  const color =
    kind === 'origin' ? theme.route.color : kind === 'destination' ? theme.marker.color : theme.colors.accent
  return L.divIcon({
    className: 'atlas-marker',
    // `cam-upright`: con el mapa girado/inclinado el marcador se mantiene derecho (ver map.css).
    html: `<div class="cam-upright" style="transform-origin:${theme.marker.shape === 'pin' ? '50% 100%' : '50% 50%'}"><div class="mk mk-${theme.marker.shape}" style="--c:${color}"><span>${escapeHtml(label)}</span></div></div>`,
    iconSize: [34, 34],
    iconAnchor: theme.marker.shape === 'pin' ? [17, 34] : [17, 17],
  })
}

export function poiIcon(theme: MapTheme, category: PoiCategory, selected: boolean) {
  const def = POI_CATEGORY_MAP[category]
  const size = theme.poi.size
  return L.divIcon({
    className: 'atlas-marker',
    html: `<div class="cam-upright"><div class="poi poi-${theme.poi.style}${selected ? ' is-selected' : ''}" style="--c:${def.color}">${iconSvg(def.icon)}</div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Marcador del usuario; en navegación, una flecha orientada al rumbo (grados, 0 = norte). */
export const userIcon = (navigating: boolean, heading = 0) =>
  L.divIcon({
    className: 'atlas-marker',
    // El icono «Navigation» de Lucide apunta al noreste (45°): se compensa.
    html: navigating
      ? `<div class="nav-puck"><span data-arrow style="display:grid;transform:rotate(${Math.round(heading - 45)}deg)">${iconSvg('Navigation')}</span></div>`
      : '<div class="user-dot pulse"></div>',
    iconSize: navigating ? [28, 28] : [20, 20],
    iconAnchor: navigating ? [14, 14] : [10, 10],
  })

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
