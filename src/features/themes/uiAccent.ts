import { contrast, mix, textOn } from '@/utils/color'

/**
 * Fondo de los paneles en el PEOR caso: son translúcidos (92 %), así que sobre un mapa
 * negro el panel claro se ve algo gris y sobre un mapa blanco el oscuro, algo más claro.
 */
export const PANEL_BG = { light: mix('#ffffff', '#000000', 0.08), dark: mix('#0b1020', '#ffffff', 0.08) }
/** Tinte del fondo de los elementos activos (p. ej. la pestaña elegida: bg-accent/10). */
const ACTIVE_TINT = 0.12
/** Contraste mínimo buscado (4,5:1 de WCAG AA con un pequeño margen por el redondeo). */
const MIN = 4.6

/**
 * Color de acento de la INTERFAZ a partir del acento del tema del mapa. El del mapa
 * puede ser cian, rosa o casi negro (bonito en el mapa, ilegible como texto del
 * panel); aquí se ajusta lo justo para que el texto en ese color tenga contraste
 * ≥ 4,5:1 sobre el panel, también sobre el fondo teñido de un elemento activo, y se
 * elige el texto (blanco o casi negro) que mejor se lee sobre un botón de ese color.
 */
export function uiAccentFor(themeAccent: string, dark: boolean) {
  const bg = dark ? PANEL_BG.dark : PANEL_BG.light
  // El fondo teñido depende del propio color elegido: se busca el ajuste mínimo con el
  // que el color se lee sobre el panel Y sobre su propio tinte.
  const ok = (c: string) => contrast(c, bg) >= MIN && contrast(c, mix(bg, c, ACTIVE_TINT)) >= MIN
  let accent = themeAccent
  if (!ok(accent)) {
    const toward = dark ? '#ffffff' : '#000000'
    let lo = 0
    let hi = 1
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2
      if (ok(mix(themeAccent, toward, t))) hi = t
      else lo = t
    }
    accent = mix(themeAccent, toward, hi)
  }
  return { accent, onAccent: textOn(accent), contrastOnPanel: contrast(accent, bg) }
}
