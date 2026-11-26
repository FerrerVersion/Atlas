import { MapControls } from '@/components/map/MapControls'
import { MapView } from '@/components/map/MapView'
import { lazy, Suspense } from 'react'
import { Toasts } from '@/components/ui/Toasts'
import { useAutoLocation } from '@/hooks/useGeolocation'
import { useNavigationRunner } from '@/hooks/useNavigationRunner'
import { usePoiLoader } from '@/hooks/usePoiLoader'
import { useRoadAutoLoader } from '@/hooks/useRoadAutoLoader'
import { useRouteComputation } from '@/hooks/useRouteComputation'
import { useMapTheme, useMediaQuery } from '@/hooks/useUiTheme'
import { useAppStore } from '@/store/useAppStore'
import { MobileNavigation } from './MobileNavigation'
import { Sidebar } from './Sidebar'

// El modo navegación solo se descarga al iniciarlo (o en reposo, ver PanelContent).
const NavigationHUD = lazy(() => import('@/components/navigation/NavigationHUD').then((m) => ({ default: m.NavigationHUD })))

export function AppShell() {
  const theme = useMapTheme()
  const desktop = useMediaQuery('(min-width: 768px)')
  const navigating = useAppStore((s) => s.navigation.active)
  const sheetExpanded = useAppStore((s) => s.sheetExpanded)
  useRouteComputation()
  usePoiLoader()
  useRoadAutoLoader()
  useNavigationRunner()
  useAutoLocation()

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ ['--ui-accent' as string]: theme.colors.accent }}>
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
    </div>
  )
}
