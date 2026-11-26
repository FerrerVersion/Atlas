import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MultiRoute } from '@/features/routing/routeTypes'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

// Componentes pesados sustituidos por contadores de renders (Leaflet no funciona en jsdom).
const renders = { map: 0, controls: 0, sidebar: 0 }
vi.mock('@/components/map/MapView', () => ({ MapView: () => (renders.map++, null) }))
vi.mock('@/components/map/MapControls', () => ({ MapControls: () => (renders.controls++, null) }))
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => (renders.sidebar++, null) }))
vi.mock('@/components/layout/MobileNavigation', () => ({ MobileNavigation: () => null }))
// La lógica sin interfaz no interesa aquí (no debe descargar nada).
vi.mock('@/hooks/useRouteComputation', () => ({ useRouteComputation: () => undefined }))
vi.mock('@/hooks/usePoiLoader', () => ({ usePoiLoader: () => undefined }))
vi.mock('@/hooks/useRoadAutoLoader', () => ({ useRoadAutoLoader: () => undefined }))

const { AppShell } = await import('@/components/layout/AppShell')

const PREFS_KEY = 'atlas-nav:prefs'
const fakeRoute = {
  distance: 1000,
  duration: 120,
  geometry: [
    [39.4, -0.79],
    [39.41, -0.79],
  ],
  legs: [],
  nodes: [],
  instructions: [],
  snapped: [],
} as unknown as MultiRoute

const fix = (i: number) => ({ lat: 39.4 + i * 1e-4, lng: -0.79, accuracy: 8, heading: null, speed: 10, timestamp: 1_000 + i * 1_000 })

describe('estado de GPS y navegación (separado de las preferencias)', () => {
  let writes: string[]
  beforeEach(() => {
    writes = []
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      writes.push(k)
      return original.call(this, k, v)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useAppStore.getState().clearRoute()
  })

  it('las lecturas del GPS y el avance de la navegación no escriben en localStorage', () => {
    const nav = useNavStore.getState()
    nav.setLocationStatus('active')
    for (let i = 0; i < 50; i++) {
      useNavStore.getState().setUserLocation(fix(i))
      useNavStore.getState().setNavProgress(i * 10)
    }
    expect(writes.filter((k) => k === PREFS_KEY)).toHaveLength(0)
  })

  it('el store principal solo escribe cuando cambia una preferencia guardada', () => {
    const s = useAppStore.getState()
    // Cambios de sesión (mensajes de progreso de la ruta, avisos, panel): no se guardan.
    for (let i = 0; i < 20; i++) useAppStore.getState().setRoute(null, 'loading', `Descargando (${i}/20)…`)
    s.setSheetExpanded(true)
    s.notify('hola')
    expect(writes.filter((k) => k === PREFS_KEY)).toHaveLength(0)
    // Cambiar el tema sí se guarda (una vez).
    useAppStore.getState().setTheme(useAppStore.getState().themeId === 'cyberpunk' ? 'classic' : 'cyberpunk')
    expect(writes.filter((k) => k === PREFS_KEY)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).state.themeId).toBe(useAppStore.getState().themeId)
  })

  it('una ruta nueva reinicia el avance y borrar la ruta sale de la navegación', () => {
    useAppStore.getState().setRoute(fakeRoute, 'ready')
    useAppStore.getState().startNavigation()
    useNavStore.getState().setNavProgress(400)
    expect(useNavStore.getState().navigation).toMatchObject({ active: true, progress: 400 })
    expect(useAppStore.getState().sheetExpanded).toBe(false)

    useAppStore.getState().setRoute({ ...fakeRoute }, 'ready')
    expect(useNavStore.getState().navigation).toMatchObject({ active: true, progress: 0 })

    useAppStore.getState().clearRoute()
    expect(useNavStore.getState().navigation.active).toBe(false)
  })

  it('las lecturas del GPS y el avance no vuelven a pintar el mapa ni los paneles', async () => {
    useAppStore.getState().setRoute(fakeRoute, 'ready')
    render(<AppShell />)
    await act(async () => {})
    const before = { ...renders }
    await act(async () => {
      for (let i = 0; i < 30; i++) useNavStore.getState().setUserLocation(fix(i))
    })
    expect(renders).toEqual(before)
  })
})
