import type { CurveClass } from './pacenotes'

/**
 * Forma de la curva para el Modo Rally: un trazo con recta de entrada, el arco con el
 * ÁNGULO real de la nota y un radio visual según su clase (más cerrada = más apretada), y
 * la salida con punta de flecha. Coordenadas SVG normalizadas a una caja de 100 × 100.
 */

export interface CurveShape {
  /** Atributo `d` del trazo. */
  path: string
  /** Triángulo de la punta de flecha (`points`). */
  head: string
}

/** Radio visual (unidades arbitrarias) de cada clase: solo afecta a cómo se dibuja. */
const VISUAL_RADIUS: Record<CurveClass, number> = {
  'very-gentle': 130,
  gentle: 85,
  medium: 58,
  tight: 40,
  'very-tight': 30,
  hairpin: 22,
}

export function curveShape(angle: number, curve: CurveClass | null, pad = 10): CurveShape {
  const a = Math.max(-200, Math.min(200, angle))
  const r = curve ? VISUAL_RADIUS[curve] : 60
  const lead = 46
  const exit = 34
  const steps = Math.max(2, Math.ceil(Math.abs(a) / 6))
  const pts: [number, number][] = [[0, 0]]
  let h = -90 // hacia arriba en pantalla (y crece hacia abajo)
  let x = 0
  let y = 0
  const step = (len: number) => {
    x += len * Math.cos((h * Math.PI) / 180)
    y += len * Math.sin((h * Math.PI) / 180)
    pts.push([x, y])
  }
  step(lead)
  const arcStep = (r * Math.abs(a) * Math.PI) / 180 / steps
  for (let i = 0; i < steps; i++) {
    h += a / steps
    step(arcStep)
  }
  step(exit)

  // Encaje en la caja con margen, manteniendo la proporción (y un hueco para la punta).
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const head = 14
  const size = Math.max(maxX - minX, maxY - minY) + head * 2
  const k = (100 - pad * 2) / size
  const ox = pad + ((100 - pad * 2) - (maxX - minX) * k) / 2 - minX * k
  const oy = pad + ((100 - pad * 2) - (maxY - minY) * k) / 2 - minY * k
  const T = ([px, py]: [number, number]): [number, number] => [ox + px * k, oy + py * k]
  const tp = pts.map(T)

  // Punta: triángulo orientado según el rumbo final. El trazo termina un poco antes de su
  // base, así el remate redondeado de la línea no asoma por la punta.
  const [ex, ey] = tp[tp.length - 1]
  const hr = (h * Math.PI) / 180
  const len = head * k * 2
  const wid = head * k * 1.25
  const tip: [number, number] = [ex + Math.cos(hr) * len * 0.75, ey + Math.sin(hr) * len * 0.75]
  const back: [number, number] = [ex - Math.cos(hr) * len * 0.25, ey - Math.sin(hr) * len * 0.25]
  tp[tp.length - 1] = [ex - Math.cos(hr) * len * 0.05, ey - Math.sin(hr) * len * 0.05]
  const path = tp.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const nx = -Math.sin(hr) * wid
  const ny = Math.cos(hr) * wid
  const headPts = [tip, [back[0] + nx, back[1] + ny], [back[0] - nx, back[1] - ny]]
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ')
  return { path, head: headPts }
}
