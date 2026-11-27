import type { MapTheme, ThemeCategory } from './themeTypes'
import { blueprint } from './themes/blueprint'
import { classic } from './themes/classic'
import { cyberpunk } from './themes/cyberpunk'
import { darkPremium } from './themes/darkPremium'
import { handDrawn, topographic } from './themes/extras'
import { fantasy } from './themes/fantasy'
import { minimal } from './themes/minimal'
import { retroArcade } from './themes/retroArcade'
import { satellite } from './themes/satellite'

/** Orden de presentación en el selector. Añade aquí los temas nuevos. */
export const THEMES: MapTheme[] = [
  classic,
  satellite,
  darkPremium,
  minimal,
  cyberpunk,
  blueprint,
  retroArcade,
  fantasy,
  topographic,
  handDrawn,
]

/**
 * Temas fusionados (eran demasiado parecidos a otro o perjudicaban la navegación):
 * quien los tuviera guardados pasa al más parecido, no al tema por defecto.
 */
export const THEME_ALIASES: Record<string, string> = {
  'open-world': 'classic', // el mismo mapa OSM con más saturación
  vintage: 'fantasy', // cartografía antigua en sepia
  noir: 'minimal', // monocromo
  holographic: 'cyberpunk', // neón sobre fondo oscuro
  chaos: 'classic', // colores que mutaban: molestaba al navegar (y a personas fotosensibles)
}

export const DEFAULT_THEME_ID = classic.id
export const NIGHT_THEME_ID = darkPremium.id

const byId = new Map(THEMES.map((t) => [t.id, t]))

/** Id vigente de un tema (resuelve los fusionados); null si no existe. */
export function resolveThemeId(id: string | null | undefined): string | null {
  if (!id) return null
  if (byId.has(id)) return id
  const alias = THEME_ALIASES[id]
  return alias && byId.has(alias) ? alias : null
}

export function getTheme(id: string | null | undefined): MapTheme {
  return byId.get(resolveThemeId(id) ?? '') || classic
}

export const hasTheme = (id: string) => resolveThemeId(id) !== null

export const CATEGORY_LABELS: Record<ThemeCategory, string> = {
  classic: 'Clásicos',
  realistic: 'Realistas',
  dark: 'Oscuros',
  futuristic: 'Futuristas',
  creative: 'Creativos',
}
