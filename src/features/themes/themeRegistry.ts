import type { MapTheme, ThemeCategory } from './themeTypes'
import { blueprint } from './themes/blueprint'
import { chaos } from './themes/chaos'
import { classic } from './themes/classic'
import { cyberpunk } from './themes/cyberpunk'
import { darkPremium } from './themes/darkPremium'
import { handDrawn, holographic, noir, topographic, vintage } from './themes/extras'
import { fantasy } from './themes/fantasy'
import { minimal } from './themes/minimal'
import { openWorld } from './themes/openWorld'
import { retroArcade } from './themes/retroArcade'
import { satellite } from './themes/satellite'

/** Orden de presentación en el selector. Añade aquí los temas nuevos. */
export const THEMES: MapTheme[] = [
  classic,
  satellite,
  darkPremium,
  minimal,
  cyberpunk,
  openWorld,
  blueprint,
  retroArcade,
  fantasy,
  chaos,
  vintage,
  noir,
  topographic,
  handDrawn,
  holographic,
]

export const DEFAULT_THEME_ID = classic.id
export const NIGHT_THEME_ID = darkPremium.id

const byId = new Map(THEMES.map((t) => [t.id, t]))

export function getTheme(id: string | null | undefined): MapTheme {
  return (id && byId.get(id)) || classic
}

export const hasTheme = (id: string) => byId.has(id)

export const CATEGORY_LABELS: Record<ThemeCategory, string> = {
  classic: 'Clásicos',
  realistic: 'Realistas',
  dark: 'Oscuros',
  futuristic: 'Futuristas',
  creative: 'Creativos',
}
