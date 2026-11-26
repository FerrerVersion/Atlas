import { Clock, Gauge, Milestone, Navigation, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatDistance, formatDuration } from '@/utils/distance'
import { useNow } from '@/hooks/useMediaQuery'
import { navigationState } from '@/features/navigation/navigationProgress'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

export function RouteSummary() {
  const route = useAppStore((s) => s.route)
  const live = useNavStore((s) => s.live)
  const now = useNow()
  if (!route) return null
  // Si el GPS te sitúa ya sobre la ruta, se muestra lo que queda en tiempo real.
  const onRoute = live.status === 'tracking' && live.progress > 0
  const liveState = onRoute ? navigationState(route, live.progress) : null
  const eta = new Date(now + route.duration * 1000)
  const avg = route.duration > 0 ? (route.distance / route.duration) * 3.6 : 0
  return (
    <section className="space-y-3 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5 p-4" aria-label="Resumen de la ruta">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums" data-testid="route-duration">
            {formatDuration(route.duration)}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="route-distance">
            {formatDistance(route.distance)} · llegada {eta.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Button variant="primary" icon={<Navigation className="h-4 w-4" />} onClick={() => useAppStore.getState().startNavigation()}>
          Iniciar
        </Button>
      </div>
      {route.incomplete && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          data-testid="route-incomplete"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Ruta aproximada: no se pudieron descargar todos los datos de OpenStreetMap, así que puede no ser la mejor. Vuelve a
          calcularla en unos minutos.
        </p>
      )}
      {liveState && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300" data-testid="live-summary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          En ruta ahora: quedan {formatDistance(liveState.remainingDistance)} ·{' '}
          {formatDuration(liveState.remainingTime)} · llegada{' '}
          {new Date(now + liveState.remainingTime * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      <dl className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
        <div className="rounded-xl bg-white/50 p-2 dark:bg-white/5">
          <Milestone className="mx-auto mb-0.5 h-3.5 w-3.5" />
          <dt className="sr-only">Tramos</dt>
          <dd>{route.legs.length} {route.legs.length === 1 ? 'tramo' : 'tramos'}</dd>
        </div>
        <div className="rounded-xl bg-white/50 p-2 dark:bg-white/5">
          <Gauge className="mx-auto mb-0.5 h-3.5 w-3.5" />
          <dt className="sr-only">Velocidad media</dt>
          <dd>{Math.round(avg)} km/h media</dd>
        </div>
        <div className="rounded-xl bg-white/50 p-2 dark:bg-white/5">
          <Clock className="mx-auto mb-0.5 h-3.5 w-3.5" />
          <dt className="sr-only">Maniobras</dt>
          <dd>{route.instructions.length} indicaciones</dd>
        </div>
      </dl>
      {route.legs.length > 1 && (
        <ol className="space-y-1 text-xs">
          {route.legs.map((l, i) => (
            <li key={i} className="flex justify-between rounded-lg bg-white/40 px-2.5 py-1.5 dark:bg-white/5">
              <span>Tramo {i + 1}</span>
              <span className="tabular-nums">
                {formatDistance(l.result.distance)} · {formatDuration(l.result.duration)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => useAppStore.getState().clearRoute()}>
        Limpiar ruta
      </Button>
    </section>
  )
}
