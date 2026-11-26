import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Place } from '@/features/geocoding/geocodingService'
import type { POI, PoiCategory } from '@/features/poi/poiTypes'
import type { CostMode, MultiRoute, TravelProfile } from '@/features/routing/routeTypes'
import { DEFAULT_THEME_ID, hasTheme } from '@/features/themes/themeRegistry'
import type { BBox } from '@/utils/geometry'
import { sanitizePrefs } from './sanitizePrefs'
import { initialTracker, remainingStopIndices, type TrackerState } from '@/features/navigation/liveTracking'

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
  autoLocate: boolean
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
  navigation: { active: boolean; progress: number; following: boolean; simulating: boolean }
  userLocation: {
    lat: number
    lng: number
    accuracy: number
    heading: number | null
    /** m/s según el dispositivo. */
    speed?: number | null
    timestamp?: number
  } | null
  /** Medición en tiempo real de la ruta con el GPS (progreso, recorrido, velocidad, estado). */
  live: TrackerState
  setLive: (t: TrackerState) => void
  /** Recalcula desde un punto (p. ej. la posición GPS) manteniendo las paradas pendientes. */
  rerouteFrom: (origin: Place) => void
  locationStatus: 'idle' | 'pending' | 'active' | 'denied' | 'unavailable'
  setLocationStatus: (s: AppState['locationStatus']) => void
  mapTarget: { lat: number; lng: number; zoom?: number; bbox?: Place['bbox']; nonce: number } | null
  fitRouteNonce: number
  toasts: Toast[]
  viewBBox: BBox | null
  roadsStatus: 'idle' | 'loading' | 'error'

  setViewBBox: (b: BBox) => void
  setRoadsStatus: (s: AppState['roadsStatus']) => void

  // Acciones
  setTheme: (id: string) => void
  setUiMode: (m: UiMode) => void
  setPref: <K extends 'autoNightTheme' | 'showLabels' | 'autoLoadRoads' | 'autoLocate'>(k: K, v: AppState[K]) => void
  setNavPrefs: (p: Partial<NavPrefs>) => void
  setPanelTab: (t: PanelTab) => void
  setSheetExpanded: (v: boolean) => void
  setSearchQuery: (q: string) => void
  selectPlace: (p: Place | null, opts?: { fly?: boolean; addToHistory?: boolean }) => void
  flyTo: (lat: number, lng: number, zoom?: number, bbox?: Place['bbox']) => void
  setLastView: (v: MapView) => void

  setWaypoint: (index: number, place: Place | null) => void
  setOrigin: (place: Place) => void
  setDestination: (place: Place) => void
  addStop: (place?: Place | null) => void
  removeWaypoint: (index: number) => void
  moveWaypoint: (from: number, to: number) => void
  swapEnds: () => void
  clearRoute: () => void
  setRoute: (r: MultiRoute | null, status: AppState['routeStatus'], message?: string | null) => void
  requestFitRoute: () => void

  toggleCategory: (c: PoiCategory) => void
  setPois: (p: POI[], status?: AppState['poiStatus']) => void
  selectPoi: (id: string | null) => void

  startNavigation: () => void
  stopNavigation: () => void
  setNavProgress: (meters: number) => void
  setNavFlags: (f: Partial<Pick<AppState['navigation'], 'following' | 'simulating'>>) => void
  setUserLocation: (l: AppState['userLocation']) => void

  toggleFavorite: (p: Place) => void
  isFavorite: (id: string) => boolean
  clearHistory: () => void

  notify: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeId: DEFAULT_THEME_ID,
      uiMode: 'system',
      autoNightTheme: false,
      showLabels: true,
      autoLoadRoads: true,
      autoLocate: true,
      navPrefs: { profile: 'car', cost: 'fastest', avoidHighways: false, voice: false },
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
      navigation: { active: false, progress: 0, following: true, simulating: false },
      userLocation: null,
      live: initialTracker(),
      setLive: (live) => set({ live }),
      rerouteFrom: (origin) =>
        set((s) => {
          const filled = s.waypoints.filter((w) => w.place)
          const legs = s.route?.legs.map((l) => l.result.distance) ?? []
          const pending = remainingStopIndices(legs, s.live.progress).map((i) => filled[i]).filter(Boolean)
          if (pending.length === 0) return {}
          return { waypoints: [{ id: newId(), place: origin }, ...pending] }
        }),
      locationStatus: 'idle',
      setLocationStatus: (locationStatus) => set({ locationStatus }),
      mapTarget: null,
      fitRouteNonce: 0,
      toasts: [],
      viewBBox: null,
      roadsStatus: 'idle',

      setViewBBox: (viewBBox) => set({ viewBBox }),
      setRoadsStatus: (roadsStatus) => set({ roadsStatus }),

      // El cambio de tema SOLO modifica themeId: ruta, búsqueda y paradas se conservan.
      setTheme: (id) => {
        if (hasTheme(id)) set({ themeId: id })
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
      setOrigin: (place) => get().setWaypoint(0, place),
      setDestination: (place) => get().setWaypoint(get().waypoints.length - 1, place),
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
      clearRoute: () =>
        set({
          waypoints: emptyWaypoints(),
          route: null,
          routeStatus: 'idle',
          routeMessage: null,
          navigation: { active: false, progress: 0, following: true, simulating: false },
        }),
      setRoute: (route, routeStatus, routeMessage = null) =>
        set((s) => {
          // Ruta nueva (p. ej. recalculada al desviarse): el avance vuelve a 0, pero se
          // conservan el recorrido y el tiempo del viaje en curso.
          if (route && route !== s.route) {
            return {
              route,
              routeStatus,
              routeMessage,
              navigation: { ...s.navigation, progress: 0 },
              live: { ...s.live, progress: 0, status: 'waiting', offRouteFixes: 0, offRouteSince: null },
            }
          }
          return { route, routeStatus, routeMessage }
        }),
      requestFitRoute: () => set((s) => ({ fitRouteNonce: s.fitRouteNonce + 1 })),

      toggleCategory: (c) =>
        set((s) => ({
          activeCategories: s.activeCategories.includes(c)
            ? s.activeCategories.filter((x) => x !== c)
            : [...s.activeCategories, c],
        })),
      setPois: (pois, poiStatus = 'idle') => set({ pois, poiStatus }),
      selectPoi: (selectedPoiId) => set({ selectedPoiId }),

      startNavigation: () =>
        set((s) => ({
          navigation: { active: true, progress: s.live.status === 'tracking' ? s.live.progress : 0, following: true, simulating: false },
          // Al iniciar se mide el viaje desde cero (recorrido y tiempo).
          live: { ...initialTracker(), progress: s.live.progress, status: s.live.status },
          sheetExpanded: false,
        })),
      stopNavigation: () => set((s) => ({ navigation: { ...s.navigation, active: false, simulating: false } })),
      setNavProgress: (progress) => set((s) => ({ navigation: { ...s.navigation, progress } })),
      setNavFlags: (f) => set((s) => ({ navigation: { ...s.navigation, ...f } })),
      setUserLocation: (userLocation) => set({ userLocation }),

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
      // getItem tolera JSON corrupto (se trata como «sin preferencias»).
      storage: createJSONStorage(() => ({
        getItem: (k) => {
          const raw = localStorage.getItem(k)
          if (!raw) return null
          try {
            JSON.parse(raw)
            return raw
          } catch {
            return null
          }
        },
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v)
          } catch {
            /* almacenamiento lleno o bloqueado */
          }
        },
        removeItem: (k) => localStorage.removeItem(k),
      })),
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted, current) }),
      partialize: (s) => ({
        themeId: s.themeId,
        uiMode: s.uiMode,
        autoNightTheme: s.autoNightTheme,
        showLabels: s.showLabels,
        autoLoadRoads: s.autoLoadRoads,
        autoLocate: s.autoLocate,
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

/** Paradas con lugar asignado, en orden. */
export const filledWaypoints = (wps: Waypoint[]) => wps.filter((w) => w.place).map((w) => w.place!)
