import { create } from 'zustand'
import { initialTracker, type TrackerState } from '@/features/navigation/liveTracking'

/**
 * Estado de alta frecuencia: GPS, medición en vivo y avance de la navegación.
 *
 * Va aparte del store principal a propósito:
 *  - NUNCA se guarda en el navegador (cambia hasta 60 veces por segundo en la
 *    simulación y con cada lectura del GPS);
 *  - solo se vuelven a pintar los componentes que leen estos datos, no toda la app.
 */
export interface UserLocation {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  /** m/s según el dispositivo. */
  speed?: number | null
  timestamp?: number
}

export type LocationStatus = 'idle' | 'pending' | 'active' | 'denied' | 'unavailable'

export interface NavigationFlags {
  active: boolean
  /** Metros avanzados sobre la ruta. */
  progress: number
  following: boolean
  simulating: boolean
}

export interface NavState {
  userLocation: UserLocation | null
  locationStatus: LocationStatus
  /** Medición en tiempo real de la ruta con el GPS (progreso, recorrido, velocidad, estado). */
  live: TrackerState
  navigation: NavigationFlags

  setUserLocation: (l: UserLocation | null) => void
  setLocationStatus: (s: LocationStatus) => void
  setLive: (t: TrackerState) => void
  setNavProgress: (meters: number) => void
  setNavFlags: (f: Partial<Pick<NavigationFlags, 'following' | 'simulating'>>) => void
  startNavigation: () => void
  stopNavigation: () => void
  /** Ruta nueva (p. ej. recalculada al desviarse): el avance vuelve a 0, se conserva el viaje. */
  resetProgressForNewRoute: () => void
  /** Sin ruta: se sale de la navegación. */
  resetNavigation: () => void
}

const idleNavigation = (): NavigationFlags => ({ active: false, progress: 0, following: true, simulating: false })

export const useNavStore = create<NavState>()((set) => ({
  userLocation: null,
  locationStatus: 'idle',
  live: initialTracker(),
  navigation: idleNavigation(),

  setUserLocation: (userLocation) => set({ userLocation }),
  setLocationStatus: (locationStatus) => set({ locationStatus }),
  setLive: (live) => set({ live }),
  setNavProgress: (progress) => set((s) => ({ navigation: { ...s.navigation, progress } })),
  setNavFlags: (f) => set((s) => ({ navigation: { ...s.navigation, ...f } })),
  startNavigation: () =>
    set((s) => ({
      navigation: { active: true, progress: s.live.status === 'tracking' ? s.live.progress : 0, following: true, simulating: false },
      // Al iniciar se mide el viaje desde cero (recorrido y tiempo).
      live: { ...initialTracker(), progress: s.live.progress, status: s.live.status },
    })),
  stopNavigation: () => set((s) => ({ navigation: { ...s.navigation, active: false, simulating: false } })),
  resetProgressForNewRoute: () =>
    set((s) => ({
      navigation: { ...s.navigation, progress: 0 },
      live: { ...s.live, progress: 0, status: 'waiting', offRouteFixes: 0, offRouteSince: null, offRouteTraveled: null },
    })),
  resetNavigation: () => set({ navigation: idleNavigation() }),
}))
