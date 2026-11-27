/**
 * Utilidades de color para garantizar contraste accesible (WCAG 2.x).
 */
type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB
}

export const rgbToHex = (rgb: RGB) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** Luminancia relativa (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Relación de contraste entre dos colores (1-21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mezcla `hex` con `toward` en la proporción `t` (0 = sin cambio, 1 = `toward`). */
export function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(toward)
  return rgbToHex(a.map((c, i) => c + (b[i] - c) * t) as RGB)
}

/** Texto (blanco o casi negro) con más contraste sobre un fondo de color. */
export const textOn = (background: string) => (contrast('#ffffff', background) >= contrast('#0b1020', background) ? '#ffffff' : '#0b1020')
