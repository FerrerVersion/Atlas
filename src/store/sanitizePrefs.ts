import type { Place } from '@/features/geocoding/geocodingService'
import { hasTheme } from '@/features/themes/themeRegistry'
import type { AppState, MapView, NavPrefs, UiMode } from './useAppStore'

type Prefs = Pick<
  AppState,
  'themeId' | 'uiMode' | 'autoNightTheme' | 'showLabels' | 'autoLoadRoads' | 'autoLocate' | 'navPrefs' | 'favorites' | 'history' | 'lastView'
>

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

function validPlace(v: unknown): v is Place {
  return (
    isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && finite(v.lat) && finite(v.lng) &&
    Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180
  )
}

function validView(v: unknown, fallback: MapView): MapView {
  if (!isObj(v) || !finite(v.lat) || !finite(v.lng) || !finite(v.zoom)) return fallback
  if (Math.abs(v.lat) > 85 || Math.abs(v.lng) > 180) return fallback
  return { lat: v.lat, lng: v.lng, zoom: Math.min(19, Math.max(3, v.zoom)) }
}

/**
 * Valida las preferencias guardadas en el navegador antes de usarlas. Datos de
 * versiones antiguas o editados a mano nunca deben romper la app: lo que no es
 * válido se sustituye por el valor por defecto.
 */
export function sanitizePrefs(persisted: unknown, current: Prefs): Prefs {
  if (!isObj(persisted)) return current
  const p = persisted
  const nav = isObj(p.navPrefs) ? p.navPrefs : {}
  const navPrefs: NavPrefs = {
    profile: nav.profile === 'walk' || nav.profile === 'car' ? nav.profile : current.navPrefs.profile,
    cost: nav.cost === 'shortest' || nav.cost === 'fastest' ? nav.cost : current.navPrefs.cost,
    avoidHighways: bool(nav.avoidHighways, current.navPrefs.avoidHighways),
    voice: bool(nav.voice, current.navPrefs.voice),
  }
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter(validPlace).slice(0, max) : [])
  return {
    themeId: typeof p.themeId === 'string' && hasTheme(p.themeId) ? p.themeId : current.themeId,
    uiMode: (['light', 'dark', 'system'] as UiMode[]).includes(p.uiMode as UiMode) ? (p.uiMode as UiMode) : current.uiMode,
    autoNightTheme: bool(p.autoNightTheme, current.autoNightTheme),
    showLabels: bool(p.showLabels, current.showLabels),
    autoLoadRoads: bool(p.autoLoadRoads, current.autoLoadRoads),
    autoLocate: bool(p.autoLocate, current.autoLocate),
    navPrefs,
    favorites: list(p.favorites, 200),
    history: list(p.history, 25),
    lastView: validView(p.lastView, current.lastView),
  }
}
