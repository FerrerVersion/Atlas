import { describe, expect, it } from 'vitest'
import { sanitizePrefs } from '@/store/sanitizePrefs'
import { useAppStore } from '@/store/useAppStore'

const current = () => {
  const s = useAppStore.getState()
  return {
    themeId: 'classic', uiMode: 'system' as const, autoNightTheme: false, showLabels: true, autoLoadRoads: true,
    autoLocate: true, navPrefs: s.navPrefs, favorites: [], history: [], lastView: { lat: 39.47, lng: -0.38, zoom: 13 },
  }
}

describe('preferencias guardadas dañadas', () => {
  it('descarta valores inválidos sin romper nada', () => {
    const out = sanitizePrefs(
      {
        themeId: 'no-existe',
        uiMode: 'rosa',
        navPrefs: { profile: 'avion', cost: 'shortest' },
        lastView: { lat: 'x', lng: null, zoom: 99 },
        favorites: [{ id: 'a', name: 'Buñol', lat: 39.4, lng: -0.79 }, { id: 'b' }, null, 'basura'],
        history: 'no es una lista',
        showLabels: 'sí',
      },
      current(),
    )
    expect(out.themeId).toBe('classic')
    expect(out.uiMode).toBe('system')
    expect(out.navPrefs.profile).toBe('car')
    expect(out.navPrefs.cost).toBe('shortest')
    expect(out.lastView).toEqual({ lat: 39.47, lng: -0.38, zoom: 13 })
    expect(out.favorites.map((f) => f.name)).toEqual(['Buñol'])
    expect(out.history).toEqual([])
    expect(out.showLabels).toBe(true)
  })

  it('acota el zoom y conserva lo válido', () => {
    const out = sanitizePrefs({ themeId: 'cyberpunk', lastView: { lat: 40.4, lng: -3.7, zoom: 40 } }, current())
    expect(out.themeId).toBe('cyberpunk')
    expect(out.lastView).toEqual({ lat: 40.4, lng: -3.7, zoom: 19 })
  })

  it('el store se rehidrata con datos corruptos o JSON roto sin lanzar errores', async () => {
    localStorage.setItem('atlas-nav:prefs', JSON.stringify({ state: { lastView: { lat: 'x' }, themeId: 7 }, version: 1 }))
    await useAppStore.persist.rehydrate()
    expect(Number.isFinite(useAppStore.getState().lastView.lat)).toBe(true)
    localStorage.setItem('atlas-nav:prefs', '{no json')
    await expect(useAppStore.persist.rehydrate()).resolves.not.toThrow()
  })
})
