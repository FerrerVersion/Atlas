/**
 * Cámara de navegación sobre Leaflet: giro (rumbo arriba) e inclinación en perspectiva.
 *
 * Leaflet 1.9 no gira ni inclina el mapa. En lugar de cambiar de librería (habría que
 * rehacer los 10 estilos, las capas propias y el editor de mapas), el contenedor del
 * mapa se transforma con CSS 3D (`perspective · rotateX · rotateZ`). Para que siga siendo
 * interactivo:
 *  - el contenedor se agranda lo justo para cubrir la pantalla girada e inclinada, y se
 *    centra en el punto de foco (el usuario), de modo que el zoom de Leaflet «en el
 *    centro» sea zoom sobre el usuario;
 *  - los clics y el arrastre se traducen de pantalla a mapa con la homografía inversa
 *    de la transformación (ver screenToContainer), exacta también con perspectiva.
 *
 * Funciones puras: sin DOM, testeables.
 */

export interface CameraPose {
  /** Grados que se gira el mapa (el rumbo que queda arriba). 0 = norte arriba. */
  bearing: number
  /** Inclinación en grados (0 = cenital). */
  tilt: number
}

export interface Viewport {
  width: number
  height: number
}

export interface CameraLayout {
  /** Lado del contenedor cuadrado de Leaflet (px). 0 = sin transformación. */
  size: number
  /** Punto de la pantalla donde queda el foco (el usuario). */
  anchor: { x: number; y: number }
  /** Posición del contenedor respecto a la pantalla. */
  left: number
  top: number
  perspective: number
  /** `transform` CSS del contenedor ('' si no hay). */
  transform: string
  identity: boolean
}

/** Inclinación de la vista de navegación. Moderada: da profundidad sin esconder la ruta. */
export const NAV_TILT = 40
export const MAX_TILT = 55
/** Parte superior de la pantalla cubierta por la «niebla» del horizonte al inclinar. */
export const HORIZON_FRACTION = 0.16
/** Altura del foco al inclinar (fracción de la pantalla): más carretera por delante. */
export const TILTED_ANCHOR_Y = 0.7
const MARGIN = 96

/** Distancia de la perspectiva: cuanto mayor, más suave el efecto. */
export const perspectiveFor = (v: Viewport) => Math.round(Math.max(v.height, v.width * 0.75) * 1.8)

/** Altura del foco: centro con el mapa plano y más abajo al inclinar. */
export const anchorYFor = (tilt: number) => 0.5 + (TILTED_ANCHOR_Y - 0.5) * Math.min(1, Math.max(0, tilt) / NAV_TILT)

export const isIdentityPose = (p: CameraPose) => Math.abs(normBearing(p.bearing)) < 0.01 && Math.abs(p.tilt) < 0.01

const normBearing = (b: number) => {
  const n = ((b % 360) + 360) % 360
  return n > 180 ? n - 360 : n
}

/**
 * Distancia máxima (px de mapa) desde el foco que se ve en pantalla con esa pose.
 * Con inclinación, el borde superior visible (bajo la niebla) está mucho más lejos.
 */
export function visibleRadius(v: Viewport, tilt: number): number {
  const ay = v.height * anchorYFor(tilt)
  const d = perspectiveFor(v)
  const th = (Math.max(0, Math.min(tilt, MAX_TILT)) * Math.PI) / 180
  const s = Math.sin(th)
  const c = Math.cos(th)
  // Punto de pantalla a `h` px por encima del foco → distancia sobre el plano del mapa.
  const ground = (h: number) => (h * d) / Math.max(1, d * c - h * s)
  const halfWidthAt = (y: number) => (v.width / 2) * ((d + y * s) / d)
  const topVisible = tilt > 0 ? v.height * HORIZON_FRACTION : 0
  const ahead = ground(ay - topVisible)
  const behind = ((v.height - ay) * d) / (d * c + (v.height - ay) * s)
  const top = Math.hypot(halfWidthAt(ahead), ahead)
  const bottom = Math.hypot(halfWidthAt(-behind), behind)
  return Math.max(top, bottom)
}

export function cameraLayout(v: Viewport, pose: CameraPose): CameraLayout {
  const anchor = { x: v.width / 2, y: v.height * anchorYFor(pose.tilt) }
  if (isIdentityPose(pose)) {
    return { size: 0, anchor, left: 0, top: 0, perspective: 0, transform: '', identity: true }
  }
  // Tamaño redondeado a 128 px: no se redimensiona el mapa por cambios mínimos de pose.
  const size = Math.ceil((2 * visibleRadius(v, pose.tilt) + MARGIN) / 128) * 128
  const perspective = perspectiveFor(v)
  return {
    size,
    anchor,
    left: anchor.x - size / 2,
    top: anchor.y - size / 2,
    perspective,
    transform: `perspective(${perspective}px) rotateX(${pose.tilt.toFixed(2)}deg) rotateZ(${(-pose.bearing).toFixed(2)}deg)`,
    identity: false,
  }
}

/* ------------------------------------------------------------------ */
/* Proyección pantalla ↔ mapa                                           */
/* ------------------------------------------------------------------ */

/** Homografía 3×3 (fila mayor) que lleva un punto del contenedor a la pantalla. */
export type Homography = [number, number, number, number, number, number, number, number, number]

/**
 * Homografía equivalente a la transformación CSS del contenedor (origen en su centro),
 * restringida al plano z = 0 del mapa. Calculada a mano (sin DOMMatrix) para poder
 * probarla sin navegador.
 */
export function containerToScreenH(layout: CameraLayout, pose: CameraPose): Homography {
  if (layout.identity) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const o = layout.size / 2
  const b = (-pose.bearing * Math.PI) / 180
  const t = (pose.tilt * Math.PI) / 180
  const d = layout.perspective
  // p (relativo al centro) → rotateZ(−bearing) → rotateX(tilt) → perspective(d) → + centro.
  //   rotateZ: x' = cb·x − sb·y ; y' = sb·x + cb·y
  //   rotateX: X = x' ; Y = ct·y' ; Z = st·y'  (z positivo = hacia el espectador)
  //   perspective: w = 1 − Z/d  → la parte de arriba (y' < 0) se aleja y se ve menor
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  const ct = Math.cos(t)
  const st = Math.sin(t)
  const ox = layout.left + o
  const oy = layout.top + o
  const wx = -(st * sb) / d
  const wy = -(st * cb) / d
  // Filas en coordenadas relativas al centro; luego se pasa a coordenadas del contenedor
  // (x = x_c − o, y = y_c − o) recalculando la columna independiente.
  const m: Homography = [
    cb + ox * wx, -sb + ox * wy, 0,
    ct * sb + oy * wx, ct * cb + oy * wy, 0,
    wx, wy, 1,
  ]
  // Término independiente tras desplazar el origen del contenedor (x = x_c − o, y = y_c − o).
  m[2] = -o * (m[0] + m[1]) + ox
  m[5] = -o * (m[3] + m[4]) + oy
  m[8] = 1 - o * (wx + wy)
  return m
}

export function applyH(h: Homography, x: number, y: number): { x: number; y: number } {
  const w = h[6] * x + h[7] * y + h[8]
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }
}

export function invertH(h: Homography): Homography {
  const [a, b, c, d, e, f, g, i, j] = h
  const A = e * j - f * i
  const B = -(d * j - f * g)
  const C = d * i - e * g
  const det = a * A + b * B + c * C
  const k = 1 / det
  return [
    A * k, -(b * j - c * i) * k, (b * f - c * e) * k,
    B * k, (a * j - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * i - b * g) * k, (a * e - b * d) * k,
  ]
}
