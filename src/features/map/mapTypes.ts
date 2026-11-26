/** Panes propios de Leaflet y su orden de apilado. */
export const PANES = {
  roads: { name: 'roads', zIndex: 380 },
  nodes: { name: 'nodes', zIndex: 385 },
  tileLabels: { name: 'tileLabels', zIndex: 390 },
  streetLabels: { name: 'streetLabels', zIndex: 395 },
} as const

export const MIN_OVERLAY_ZOOM = 13
/** Por debajo de MIN_OVERLAY_ZOOM solo se dibujan las vías principales (red regional de 200 km). */
export const REGIONAL_MIN_ZOOM = 7
export const STREET_LABEL_MIN_ZOOM = 16
export const NODE_MIN_ZOOM = 16
