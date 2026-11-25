/** Panes propios de Leaflet y su orden de apilado. */
export const PANES = {
  roads: { name: 'roads', zIndex: 380 },
  nodes: { name: 'nodes', zIndex: 385 },
  tileLabels: { name: 'tileLabels', zIndex: 390 },
  streetLabels: { name: 'streetLabels', zIndex: 395 },
} as const

export const MIN_OVERLAY_ZOOM = 13
export const STREET_LABEL_MIN_ZOOM = 16
export const NODE_MIN_ZOOM = 16
