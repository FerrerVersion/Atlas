import { useEffect, useState } from 'react'
import { Car, Footprints, LocateFixed, Route as RouteIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, Segmented, Spinner, Toggle } from '@/components/ui/Controls'
import { requestPosition } from '@/hooks/useGeolocation'
import { useNow } from '@/hooks/useMediaQuery'
import { myLocationPlace, useAppStore } from '@/store/useAppStore'
import { NavigationInstructions } from './NavigationInstructions'
import { RouteSummary } from './RouteSummary'
import { WaypointList } from './WaypointList'

export function RoutePanel() {
  const prefs = useAppStore((s) => s.navPrefs)
  const setPrefs = useAppStore((s) => s.setNavPrefs)
  const status = useAppStore((s) => s.routeStatus)
  const message = useAppStore((s) => s.routeMessage)
  const route = useAppStore((s) => s.route)
  const originMissing = useAppStore((s) => !s.waypoints[0].place && !!s.waypoints[s.waypoints.length - 1].place)

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

      {status === 'loading' && <RouteProgress message={message} />}
      {status === 'error' && message && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-300" role="alert" data-testid="route-error">
          {message}
        </p>
      )}
      {!route && status === 'idle' && originMissing && <OriginMissing />}
      {!route && status === 'idle' && !originMissing && (
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

/** A partir de aquí se explica por qué tarda (servidores públicos lentos). */
export const SLOW_ROUTE_S = 20

/** Progreso del cálculo con el tiempo transcurrido y, si tarda, el motivo real. */
function RouteProgress({ message }: { message: string | null }) {
  const [start] = useState(() => Date.now())
  const now = useNow(1000)
  const seconds = Math.max(0, Math.round((now - start) / 1000))
  return (
    <div className="space-y-1 rounded-xl bg-slate-900/5 px-3 py-2.5 text-sm dark:bg-white/5" role="status" data-testid="route-progress">
      <p className="flex items-center gap-2">
        <Spinner /> <span className="flex-1">{message ?? 'Calculando…'}</span>
        {seconds >= 3 && <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{seconds} s</span>}
      </p>
      {seconds >= SLOW_ROUTE_S && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Las calles se descargan de los servidores públicos de OpenStreetMap y ahora van lentos. La ruta aparecerá en cuanto
          respondan; no hace falta volver a pedirla.
        </p>
      )}
    </div>
  )
}

/** Hay destino pero no origen: se explica cómo elegirlo (la ubicación solo se pide al pulsar). */
function OriginMissing() {
  const [locating, setLocating] = useState(false)
  useEffect(() => {
    // En escritorio el campo «Origen» queda listo para escribir (en el móvil no se abre
    // el teclado sin que el usuario lo pida).
    if (window.matchMedia('(min-width: 768px)').matches) document.querySelector<HTMLInputElement>('input[aria-label="Origen"]')?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-center dark:border-white/10" data-testid="origin-missing">
      <p className="text-sm font-medium">Falta el punto de partida</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">Escribe el origen, pulsa sobre el mapa o usa tu ubicación actual.</p>
      <Button
        size="sm"
        icon={locating ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />}
        disabled={locating}
        onClick={async () => {
          setLocating(true)
          const pos = await requestPosition()
          setLocating(false)
          if (pos) useAppStore.getState().setOrigin(myLocationPlace(pos.lat, pos.lng))
        }}
      >
        Salir desde mi ubicación
      </Button>
    </div>
  )
}
