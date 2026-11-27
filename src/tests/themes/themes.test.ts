import { describe, expect, it } from 'vitest'
import { TILE_PROVIDERS } from '@/features/map/tileProviders'
import { DEFAULT_THEME_ID, getTheme, resolveThemeId, THEME_ALIASES, THEMES } from '@/features/themes/themeRegistry'
import { sanitizePrefs } from '@/store/sanitizePrefs'
import { useAppStore } from '@/store/useAppStore'

const REQUIRED = [
  'classic', 'satellite', 'dark-premium', 'minimal', 'cyberpunk', 'blueprint', 'retro-arcade', 'fantasy', 'topographic', 'hand-drawn',
]

describe('registro de temas', () => {
  it('incluye los 10 estilos (tras fusionar los redundantes)', () => {
    expect(THEMES.length).toBe(10)
    for (const id of REQUIRED) expect(THEMES.some((t) => t.id === id)).toBe(true)
  })

  it('ids únicos y metadatos completos', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(2)
      expect(t.description.length).toBeGreaterThan(20)
      expect(['classic', 'realistic', 'dark', 'futuristic', 'creative']).toContain(t.category)
      for (const c of Object.values(t.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
      if (t.base) expect(TILE_PROVIDERS[t.base.provider]).toBeDefined()
      if (t.labels) expect(TILE_PROVIDERS[t.labels.provider]).toBeDefined()
    }
  })

  it('los temas son realmente distintos (no solo el fondo)', () => {
    const signature = (id: string) => {
      const t = getTheme(id)
      return JSON.stringify([t.base, t.overlay.enabled, t.overlay.classes.highway, t.route, t.marker.shape, t.typography.fontFamily])
    }
    const sigs = new Set(REQUIRED.map(signature))
    expect(sigs.size).toBe(REQUIRED.length)
  })

  it('el satélite usa imágenes aéreas', () => {
    expect(getTheme('satellite').base?.provider).toBe('esri-imagery')
  })

  it('getTheme cae al clásico si el id no existe', () => {
    expect(getTheme('no-existe').id).toBe(DEFAULT_THEME_ID)
  })
})

describe('temas fusionados', () => {
  it.each(Object.entries(THEME_ALIASES))('«%s» ya no existe y se resuelve a «%s»', (old, target) => {
    expect(THEMES.some((t) => t.id === old)).toBe(false)
    expect(resolveThemeId(old)).toBe(target)
    expect(getTheme(old).id).toBe(target)
  })

  it('una preferencia guardada con un tema fusionado pasa a su equivalente (no al por defecto)', () => {
    const current = useAppStore.getState()
    const prefs = sanitizePrefs({ themeId: 'holographic' }, current)
    expect(prefs.themeId).toBe('cyberpunk')
    expect(sanitizePrefs({ themeId: 'vintage' }, current).themeId).toBe('fantasy')
    expect(sanitizePrefs({ themeId: 'no-existe' }, current).themeId).toBe(current.themeId)
  })

  it('elegir un tema fusionado (p. ej. desde un enlace antiguo) aplica su equivalente', () => {
    useAppStore.getState().setTheme('noir')
    expect(useAppStore.getState().themeId).toBe('minimal')
    useAppStore.getState().setTheme('classic')
  })

  it('ningún tema anima el color del mapa entero', () => {
    for (const t of THEMES) expect(JSON.stringify(t.effects)).not.toMatch(/hueCycle/)
  })
})
