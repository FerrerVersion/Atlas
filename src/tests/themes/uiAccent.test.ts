import { describe, expect, it } from 'vitest'
import { PANEL_BG, uiAccentFor } from '@/features/themes/uiAccent'
import { THEMES } from '@/features/themes/themeRegistry'
import { contrast, mix } from '@/utils/color'

describe('color de acento de la interfaz (accesible con cualquier tema)', () => {
  for (const dark of [false, true]) {
    it.each(THEMES.map((t) => [t.name, t.colors.accent] as const))(`%s · interfaz ${dark ? 'oscura' : 'clara'}`, (_n, raw) => {
      const { accent, onAccent } = uiAccentFor(raw, dark)
      const bg = dark ? PANEL_BG.dark : PANEL_BG.light
      // Texto en color de acento sobre el panel y sobre una pestaña activa (fondo teñido).
      expect(contrast(accent, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(accent, mix(bg, accent, 0.12))).toBeGreaterThanOrEqual(4.5)
      // Texto de un botón de acento.
      expect(contrast(onAccent, accent)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('no cambia los acentos que ya se leían bien (p. ej. Fantasía en modo claro)', () => {
    expect(uiAccentFor('#9f1239', false).accent).toBe('#9f1239')
  })
})
