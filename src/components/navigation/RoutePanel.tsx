import { Car, Footprints, Route as RouteIcon } from 'lucide-react'
import { EmptyState, Segmented, Spinner, Toggle } from '@/components/ui/Controls'
import { useAppStore } from '@/store/useAppStore'
import { NavigationInstructions } from './NavigationInstructions'
import { RouteSummary } from './RouteSummary'
import { WaypointList } from './WaypointList'

export function RoutePanel() {
  const prefs = useAppStore((s) => s.navPrefs)
  const setPrefs = useAppStore((s) => s.setNavPrefs)
  const status = useAppStore((s) => s.routeStatus)
  const message = useAppStore((s) => s.routeMessage)
  const route = useAppStore((s) => s.route)

  return (
    <div className="space-y-5">
      <WaypointList />
      <div className="space-y-2">
        <Segmented
          label="Modo de viaje"
          value={prefs.profile}
          onChange={(profile) => setPrefs({ profile })}
          options={[
            { value: 'car', label: 'Coche', icon: <Car className="h-3.5 w-3.5" /> },
            { value: 'walk', label: 'A pie', icon: <Footprints className="h-3.5 w-3.5" /> },
          ]}
        />
        <Segmented
          label="Optimizar por"
          value={prefs.cost}
          onChange={(cost) => setPrefs({ cost })}
          options={[
            { value: 'fastest', label: 'Más rápida' },
            { value: 'shortest', label: 'Más corta' },
          ]}
        />
        {prefs.profile === 'car' && (
          <Toggle label="Evitar autopistas y autovías" checked={prefs.avoidHighways} onChange={(avoidHighways) => setPrefs({ avoidHighways })} />
        )}
      </div>

      {status === 'loading' && (
        <p className="flex items-center gap-2 rounded-xl bg-slate-900/5 px-3 py-2.5 text-sm dark:bg-white/5" role="status">
          <Spinner /> {message ?? 'Calculando…'}
        </p>
      )}
      {status === 'error' && message && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300" role="alert" data-testid="route-error">
          {message}
        </p>
      )}
      {!route && status === 'idle' && (
        <EmptyState
          icon={<RouteIcon className="h-6 w-6" />}
          title="Elige origen y destino"
          text="Busca lugares o pulsa sobre el mapa. La ruta se calcula con A* sobre las calles reales de OpenStreetMap."
        />
      )}
      <RouteSummary />
      <NavigationInstructions />
    </div>
  )
}
