import { MapControls } from '@/components/map/MapControls'
import { MapView } from '@/components/map/MapView'
import { lazy, Suspense } from 'react'
import { Toasts } from '@/components/ui/Toasts'
import { NavigationRunner } from '@/hooks/useNavigationRunner'
import { usePoiLoader } from '@/hooks/usePoiLoader'
import { useRoadAutoLoader } from '@/hooks/useRoadAutoLoader'
import { useNetworkKeepAreas } from '@/hooks/useNetworkKeepAreas'
import { useSpanishPlaceNames } from '@/hooks/useSpanishPlaceNames'
import { useRouteComputation } from '@/hooks/useRouteComputation'
import { useMapTheme, useMediaQuery } from '@/hooks/useUiTheme'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { MobileNavigation } from './MobileNavigation'
import { Sidebar } from './Sidebar'

// El modo navegación solo se descarga al iniciarlo (o en reposo, ver PanelContent).
const NavigationHUD = lazy(() => import('@/components/navigation/NavigationHUD').then((m) => ({ default: m.NavigationHUD })))

export function AppShell() {
  const theme = useMapTheme()
  const desktop = useMediaQuery('(min-width: 768px)')
  const navigating = useNavStore((s) => s.navigation.active)
  const sheetExpanded = useAppStore((s) => s.sheetExpanded)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <main className="absolute inset-0" aria-label="Mapa">
        <MapView theme={theme} />
      </main>
      <div className="pointer-events-none absolute inset-0">
        {!navigating && (desktop ? <Sidebar /> : <MobileNavigation />)}
        <div
          hidden={!desktop && sheetExpanded && !navigating}
          className={`absolute right-3 z-[950] md:right-4 ${
            navigating ? 'top-32' : desktop ? 'top-4' : 'top-[calc(max(0.75rem,env(safe-area-inset-top))+4.25rem)]'
          }`}
        >
          <MapControls compact={navigating && !desktop} />
        </div>
      </div>
      {navigating && (
        <Suspense fallback={null}>
          <NavigationHUD />
        </Suspense>
      )}
      <Toasts />
      <Orchestrators />
    </div>
  )
}

/*
 * Lógica sin interfaz (cálculo de rutas, POIs, carga de calles, GPS y navegación).
 * Cada una va en su propio componente: lo que escuchan (paradas, vista del mapa,
 * lecturas del GPS, avance de la simulación) solo repinta ese componente vacío, no
 * AppShell ni el mapa.
 */
function RouteComputation() {
  useRouteComputation()
  return null
}
function PoiLoader() {
  usePoiLoader()
  return null
}
function PlaceNames() {
  useSpanishPlaceNames()
  return null
}
function RoadAutoLoader() {
  useRoadAutoLoader()
  useNetworkKeepAreas()
  return null
}
function Orchestrators() {
  return (
    <>
      <RouteComputation />
      <PoiLoader />
      <PlaceNames />
      <RoadAutoLoader />
      <NavigationRunner />
    </>
  )
}
