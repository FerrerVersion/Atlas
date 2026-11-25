import { describe, expect, it } from 'vitest'
import { TILE_PROVIDERS } from '@/features/map/tileProviders'
import { DEFAULT_THEME_ID, getTheme, THEMES } from '@/features/themes/themeRegistry'

const REQUIRED = [
  'classic', 'satellite', 'dark-premium', 'minimal', 'cyberpunk', 'open-world', 'blueprint', 'retro-arcade', 'fantasy', 'chaos',
]

describe('registro de temas', () => {
  it('incluye al menos los 10 estilos obligatorios', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(10)
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
