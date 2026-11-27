import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { Place } from '@/features/geocoding/geocodingService'
import type { POI, PoiCategory } from '@/features/poi/poiTypes'
import type { CostMode, MultiRoute, TravelProfile } from '@/features/routing/routeTypes'
import { DEFAULT_THEME_ID, resolveThemeId } from '@/features/themes/themeRegistry'
import type { BBox } from '@/utils/geometry'
import type { LatLngTuple } from '@/utils/distance'
import { sanitizePrefs } from './sanitizePrefs'
import { remainingStopIndices } from '@/features/navigation/liveTracking'
import { useNavStore } from './useNavStore'

export interface Waypoint {
  id: string
  place: Place | null
}

export type UiMode = 'light' | 'dark' | 'system'
export type PanelTab = 'explore' | 'route' | 'styles' | 'saved' | 'settings'

export interface NavPrefs {
  profile: TravelProfile
  cost: CostMode
  avoidHighways: boolean
  voice: boolean
  /** Vista al navegar: rumbo arriba e inclinada, o norte arriba y cenital. */
  cameraView: 'heading' | 'north'
  /** Modo Rally: color, modo noche y pantalla limpia (se recuerdan). */
  rally: RallyPrefs
}

export type RallyTheme = 'red' | 'yellow' | 'blue' | 'mono'
export interface RallyPrefs {
  theme: RallyTheme
  night: boolean
  clean: boolean
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
}

export interface MapView {
  lat: number
  lng: number
  zoom: number
}

let uid = 0
const newId = () => `wp_${Date.now().toString(36)}_${(uid++).toString(36)}`
const emptyWaypoints = (): Waypoint[] => [
  { id: newId(), place: null },
  { id: newId(), place: null },
]

export interface AppState {
  // Preferencias (persistidas)
  themeId: string
  uiMode: UiMode
  autoNightTheme: boolean
  showLabels: boolean
  autoLoadRoads: boolean
  /** Pedir la ubicación y centrar el mapa al abrir la web. */
  navPrefs: NavPrefs
  favorites: Place[]
  history: Place[]
  lastView: MapView

  // Estado de sesión
  panelTab: PanelTab
  sheetExpanded: boolean
  selectedPlace: Place | null
  searchQuery: string
  waypoints: Waypoint[]
  route: MultiRoute | null
  routeStatus: 'idle' | 'loading' | 'ready' | 'error'
  routeMessage: string | null
  activeCategories: PoiCategory[]
  pois: POI[]
  poiStatus: 'idle' | 'loading' | 'error'
  selectedPoiId: string | null
  // GPS, medición en vivo y navegación viven en useNavStore (sin persistir).
  /** Recalcula desde un punto (p. ej. la posición GPS) manteniendo las paradas pendientes. */
  rerouteFrom: (origin: Place) => void
  mapTarget: { lat: number; lng: number; zoom?: number; bbox?: Place['bbox']; nonce: number } | null
  fitRouteNonce: number
  /** Puntos a encuadrar (al empezar a calcular, aún sin ruta); si no hay, la ruta. */
  fitPoints: LatLngTuple[] | null
  toasts: Toast[]
  viewBBox: BBox | null
  roadsStatus: 'idle' | 'loading' | 'error'

  setViewBBox: (b: BBox) => void
  setRoadsStatus: (s: AppState['roadsStatus']) => void

  // Acciones
  setTheme: (id: string) => void
  setUiMode: (m: UiMode) => void
  setPref: <K extends 'autoNightTheme' | 'showLabels' | 'autoLoadRoads'>(k: K, v: AppState[K]) => void
  setNavPrefs: (p: Partial<NavPrefs>) => void
  setPanelTab: (t: PanelTab) => void
  setSheetExpanded: (v: boolean) => void
  setSearchQuery: (q: string) => void
  selectPlace: (p: Place | null, opts?: { fly?: boolean; addToHistory?: boolean }) => void
  flyTo: (lat: number, lng: number, zoom?: number, bbox?: Place['bbox']) => void
  setLastView: (v: MapView) => void

  setWaypoint: (index: number, place: Place | null) => void
  /** Sustituye el lugar con ese id (p. ej. al llegar su nombre real) sin mover la parada. */
  updatePlace: (place: Place) => void
  setOrigin: (place: Place) => void
  setDestination: (place: Place) => void
  /**
   * «Ir aquí»: pone el destino y, si no hay origen y la ubicación ya está activa,
   * usa «Mi ubicación» como origen (nunca activa el GPS por su cuenta).
   */
  goTo: (place: Place, opts?: { openPanel?: boolean }) => void
  addStop: (place?: Place | null) => void
  removeWaypoint: (index: number) => void
  moveWaypoint: (from: number, to: number) => void
  swapEnds: () => void
  clearRoute: () => void
  setRoute: (r: MultiRoute | null, status: AppState['routeStatus'], message?: string | null) => void
  requestFitRoute: (points?: LatLngTuple[]) => void

  toggleCategory: (c: PoiCategory) => void
  setPois: (p: POI[], status?: AppState['poiStatus']) => void
  selectPoi: (id: string | null) => void

  /** Inicia la navegación y recoge el panel (el avance vive en useNavStore). */
  startNavigation: () => void

  toggleFavorite: (p: Place) => void
  isFavorite: (id: string) => boolean
  clearHistory: () => void

  notify: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
}

let toastId = 0

/** Campos que se guardan en el navegador (preferencias del usuario). */
type PersistedPrefs = Pick<
  AppState,
  'themeId' | 'uiMode' | 'autoNightTheme' | 'showLabels' | 'autoLoadRoads' | 'navPrefs' | 'favorites' | 'history' | 'lastView'
>

/**
 * Almacenamiento de las preferencias. El middleware `persist` intenta guardar tras
 * CADA cambio del store (también los de sesión: mensajes, paradas, avisos…); aquí
 * solo se escribe en localStorage si ha cambiado alguno de los campos guardados.
 * getItem tolera JSON corrupto (se trata como «sin preferencias»).
 */
let lastSaved: PersistedPrefs | null = null
const samePrefs = (a: PersistedPrefs, b: PersistedPrefs) =>
  (Object.keys(a) as (keyof PersistedPrefs)[]).every((k) => Object.is(a[k], b[k]))

export const prefsStorage: PersistStorage<PersistedPrefs> = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name)
      return raw ? (JSON.parse(raw) as StorageValue<PersistedPrefs>) : null
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    if (lastSaved && samePrefs(lastSaved, value.state)) return
    lastSaved = value.state
    try {
      localStorage.setItem(name, JSON.stringify(value))
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  },
  removeItem: (name) => {
    lastSaved = null
    try {
      localStorage.removeItem(name)
    } catch {
      /* almacenamiento bloqueado */
    }
  },
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeId: DEFAULT_THEME_ID,
      uiMode: 'system',
      autoNightTheme: false,
      showLabels: true,
      autoLoadRoads: true,
      navPrefs: {
        profile: 'car',
        cost: 'fastest',
        avoidHighways: false,
        voice: false,
        cameraView: 'heading',
        rally: { theme: 'red', night: false, clean: false },
      },
      favorites: [],
      history: [],
      lastView: { lat: 39.4699, lng: -0.3763, zoom: 13 },

      panelTab: 'explore',
      sheetExpanded: false,
      selectedPlace: null,
      searchQuery: '',
      waypoints: emptyWaypoints(),
      route: null,
      routeStatus: 'idle',
      routeMessage: null,
      activeCategories: [],
      pois: [],
      poiStatus: 'idle',
      selectedPoiId: null,
      rerouteFrom: (origin) =>
        set((s) => {
          const filled = s.waypoints.filter((w) => w.place)
          const legs = s.route?.legs.map((l) => l.result.distance) ?? []
          const progress = useNavStore.getState().live.progress
          const pending = remainingStopIndices(legs, progress).map((i) => filled[i]).filter(Boolean)
          if (pending.length === 0) return {}
          return { waypoints: [{ id: newId(), place: origin }, ...pending] }
        }),
      mapTarget: null,
      fitRouteNonce: 0,
      fitPoints: null,
      toasts: [],
      viewBBox: null,
      roadsStatus: 'idle',

      setViewBBox: (viewBBox) => set({ viewBBox }),
      setRoadsStatus: (roadsStatus) => set({ roadsStatus }),

      // El cambio de tema SOLO modifica themeId: ruta, búsqueda y paradas se conservan.
      setTheme: (id) => {
        const resolved = resolveThemeId(id)
        if (resolved) set({ themeId: resolved })
      },
      setUiMode: (uiMode) => set({ uiMode }),
      setPref: (k, v) => set({ [k]: v } as Pick<AppState, typeof k>),
      setNavPrefs: (p) => set((s) => ({ navPrefs: { ...s.navPrefs, ...p } })),
      setPanelTab: (panelTab) => set({ panelTab, sheetExpanded: true }),
      setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),

      selectPlace: (p, opts = {}) => {
        set({ selectedPlace: p })
        if (!p) return
        if (opts.addToHistory !== false && p.kind !== 'category') {
          set((s) => ({ history: [p, ...s.history.filter((h) => h.id !== p.id)].slice(0, 25) }))
        }
        if (opts.fly !== false) get().flyTo(p.lat, p.lng, zoomForKind(p.kind), p.bbox)
      },
      flyTo: (lat, lng, zoom, bbox) => set({ mapTarget: { lat, lng, zoom, bbox, nonce: Date.now() } }),
      setLastView: (lastView) => set({ lastView }),

      setWaypoint: (index, place) =>
        set((s) => ({ waypoints: s.waypoints.map((w, i) => (i === index ? { ...w, place } : w)) })),
      updatePlace: (place) =>
        set((s) => ({
          waypoints: s.waypoints.map((w) => (w.place?.id === place.id ? { ...w, place: { ...place, lat: w.place.lat, lng: w.place.lng } } : w)),
          selectedPlace: s.selectedPlace?.id === place.id ? place : s.selectedPlace,
          history: s.history.some((h) => h.id === place.id) ? s.history.map((h) => (h.id === place.id ? { ...h, name: place.name } : h)) : s.history,
        })),
      setOrigin: (place) => get().setWaypoint(0, place),
      setDestination: (place) => get().setWaypoint(get().waypoints.length - 1, place),
      goTo: (place, opts = {}) => {
        get().setDestination(place)
        const me = useNavStore.getState().userLocation
        if (!get().waypoints[0].place && me) get().setOrigin(myLocationPlace(me.lat, me.lng))
        if (opts.openPanel !== false) set({ panelTab: 'route', sheetExpanded: true })
      },
      addStop: (place = null) =>
        set((s) => {
          const wps = [...s.waypoints]
          wps.splice(wps.length - 1, 0, { id: newId(), place })
          return { waypoints: wps }
        }),
      removeWaypoint: (index) =>
        set((s) => {
          if (s.waypoints.length <= 2) {
            return { waypoints: s.waypoints.map((w, i) => (i === index ? { ...w, place: null } : w)) }
          }
          return { waypoints: s.waypoints.filter((_, i) => i !== index) }
        }),
      moveWaypoint: (from, to) =>
        set((s) => {
          if (to < 0 || to >= s.waypoints.length || from === to) return {}
          const wps = [...s.waypoints]
          const [m] = wps.splice(from, 1)
          wps.splice(to, 0, m)
          return { waypoints: wps }
        }),
      swapEnds: () => set((s) => ({ waypoints: [...s.waypoints].reverse() })),
      clearRoute: () => {
        set({ waypoints: emptyWaypoints(), route: null, routeStatus: 'idle', routeMessage: null })
        useNavStore.getState().resetNavigation()
      },
      setRoute: (route, routeStatus, routeMessage = null) => {
        // Ruta nueva (p. ej. recalculada al desviarse): el avance vuelve a 0, pero se
        // conservan el recorrido y el tiempo del viaje en curso.
        if (route && route !== get().route) useNavStore.getState().resetProgressForNewRoute()
        set({ route, routeStatus, routeMessage })
      },
      requestFitRoute: (points) => set((s) => ({ fitRouteNonce: s.fitRouteNonce + 1, fitPoints: points ?? null })),

      toggleCategory: (c) =>
        set((s) => ({
          activeCategories: s.activeCategories.includes(c)
            ? s.activeCategories.filter((x) => x !== c)
            : [...s.activeCategories, c],
        })),
      setPois: (pois, poiStatus = 'idle') => set({ pois, poiStatus }),
      selectPoi: (selectedPoiId) => set({ selectedPoiId }),

      startNavigation: () => {
        useNavStore.getState().startNavigation()
        set({ sheetExpanded: false })
      },

      toggleFavorite: (p) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.id === p.id)
            ? s.favorites.filter((f) => f.id !== p.id)
            : [{ ...p, distanceMeters: undefined }, ...s.favorites],
        })),
      isFavorite: (id) => get().favorites.some((f) => f.id === id),
      clearHistory: () => set({ history: [] }),

      notify: (text, kind = 'info') => {
        const id = ++toastId
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }))
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4000)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'atlas-nav:prefs',
      version: 1,
      storage: prefsStorage,
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted, current) }),
      partialize: (s): PersistedPrefs => ({
        themeId: s.themeId,
        uiMode: s.uiMode,
        autoNightTheme: s.autoNightTheme,
        showLabels: s.showLabels,
        autoLoadRoads: s.autoLoadRoads,
        navPrefs: s.navPrefs,
        favorites: s.favorites,
        history: s.history,
        lastView: s.lastView,
      }),
    },
  ),
)

export function zoomForKind(kind: Place['kind']): number {
  switch (kind) {
    case 'country':
      return 6
    case 'region':
      return 9
    case 'city':
      return 13
    case 'town':
      return 14
    case 'village':
    case 'suburb':
      return 15
    case 'street':
      return 17
    default:
      return 17
  }
}

/** Lugar «Mi ubicación» (posición del GPS) para usar como parada. */
export function myLocationPlace(lat: number, lng: number): Place {
  return {
    id: `gps:${lat.toFixed(6)},${lng.toFixed(6)}`,
    name: 'Mi ubicación',
    kind: 'coordinates',
    kindLabel: 'Ubicación GPS',
    lat,
    lng,
    source: 'gps',
  }
}

/** Paradas con lugar asignado, en orden. */
export const filledWaypoints = (wps: Waypoint[]) => wps.filter((w) => w.place).map((w) => w.place!)
