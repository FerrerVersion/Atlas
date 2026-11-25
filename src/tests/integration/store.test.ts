import { beforeEach, describe, expect, it } from 'vitest'
import type { Place } from '@/features/geocoding/geocodingService'
import type { MultiRoute } from '@/features/routing/routeTypes'
import { filledWaypoints, useAppStore } from '@/store/useAppStore'

const place = (name: string, lat: number, lng: number): Place => ({
  id: name,
  name,
  kind: 'town',
  kindLabel: 'Municipio',
  lat,
  lng,
  source: 'photon',
})

const fakeRoute = { distance: 1000, duration: 120, geometry: [[0, 0], [0, 1]], legs: [], nodes: [], instructions: [], snapped: [] } as unknown as MultiRoute

describe('store global', () => {
  beforeEach(() => useAppStore.getState().clearRoute())

  it('cambiar de tema no borra ruta, paradas, búsqueda ni lugar seleccionado', () => {
    const s = useAppStore.getState()
    s.setOrigin(place('Valencia', 39.47, -0.376))
    s.setDestination(place('Buñol', 39.419, -0.791))
    s.setSearchQuery('Buñol')
    s.selectPlace(place('Buñol', 39.419, -0.791), { fly: false })
    s.setRoute(fakeRoute, 'ready')
    const before = useAppStore.getState()

    for (const id of ['cyberpunk', 'blueprint', 'fantasy', 'classic']) useAppStore.getState().setTheme(id)

    const after = useAppStore.getState()
    expect(after.themeId).toBe('classic')
    expect(after.route).toBe(before.route)
    expect(after.waypoints).toBe(before.waypoints)
    expect(after.searchQuery).toBe('Buñol')
    expect(after.selectedPlace).toEqual(before.selectedPlace)
    expect(after.lastView).toEqual(before.lastView)
  })

  it('ignora temas inexistentes', () => {
    useAppStore.getState().setTheme('cyberpunk')
    useAppStore.getState().setTheme('inventado')
    expect(useAppStore.getState().themeId).toBe('cyberpunk')
  })

  it('gestiona paradas: añadir, reordenar, eliminar e intercambiar', () => {
    const s = useAppStore.getState()
    s.setOrigin(place('A', 0, 0))
    s.setDestination(place('C', 0, 2))
    s.addStop(place('B', 0, 1))
    expect(filledWaypoints(useAppStore.getState().waypoints).map((p) => p.name)).toEqual(['A', 'B', 'C'])
    useAppStore.getState().moveWaypoint(1, 0)
    expect(filledWaypoints(useAppStore.getState().waypoints).map((p) => p.name)).toEqual(['B', 'A', 'C'])
    useAppStore.getState().swapEnds()
    expect(filledWaypoints(useAppStore.getState().waypoints).map((p) => p.name)).toEqual(['C', 'A', 'B'])
    useAppStore.getState().removeWaypoint(1)
    expect(useAppStore.getState().waypoints).toHaveLength(2)
    useAppStore.getState().removeWaypoint(0)
    expect(useAppStore.getState().waypoints).toHaveLength(2)
    expect(useAppStore.getState().waypoints[0].place).toBeNull()
  })

  it('persiste preferencias en LocalStorage (sin la ruta)', () => {
    const s = useAppStore.getState()
    s.setTheme('retro-arcade')
    s.setUiMode('dark')
    s.toggleFavorite(place('Madrid', 40.4168, -3.7038))
    s.setRoute(fakeRoute, 'ready')
    const raw = JSON.parse(localStorage.getItem('atlas-nav:prefs')!)
    expect(raw.state.themeId).toBe('retro-arcade')
    expect(raw.state.uiMode).toBe('dark')
    expect(raw.state.favorites[0].name).toBe('Madrid')
    expect(raw.state.route).toBeUndefined()
  })

  it('historial sin duplicados y limitado', () => {
    const s = useAppStore.getState()
    s.clearHistory()
    for (let i = 0; i < 30; i++) s.selectPlace(place(`P${i % 27}`, 0, 0), { fly: false })
    const h = useAppStore.getState().history
    expect(h.length).toBeLessThanOrEqual(25)
    expect(new Set(h.map((p) => p.id)).size).toBe(h.length)
  })
})
