import { Clock, Gauge, Milestone, Navigation, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatDistance, formatDuration } from '@/utils/distance'
import { useNow } from '@/hooks/useMediaQuery'
import { useAppStore } from '@/store/useAppStore'

export function RouteSummary() {
  const route = useAppStore((s) => s.route)
  const now = useNow()
  if (!route) return null
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
