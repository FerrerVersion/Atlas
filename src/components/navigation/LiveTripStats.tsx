import { Gauge, Route, Satellite, Timer } from 'lucide-react'
import type { TrackerState } from '@/features/navigation/liveTracking'
import { useNow } from '@/hooks/useMediaQuery'
import { formatDistance } from '@/utils/distance'
import { SIM_SPEEDUP } from '@/hooks/useNavigationRunner'

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Estado de la señal GPS en lenguaje llano. */
function gpsLabel(live: TrackerState, simulating: boolean, accuracy: number | null) {
  if (simulating) return { text: `Simulación ×${SIM_SPEEDUP}`, tone: 'text-sky-500' }
  switch (live.status) {
    case 'waiting':
      return { text: 'Esperando GPS…', tone: 'text-slate-400' }
    case 'weak-signal':
      return { text: `Señal débil${accuracy ? ` (±${Math.round(accuracy)} m)` : ''}`, tone: 'text-amber-500' }
    case 'off-route':
      return { text: `Fuera de ruta${live.distanceToRoute ? ` (${formatDistance(live.distanceToRoute)})` : ''}`, tone: 'text-rose-500' }
    case 'arrived':
      return { text: 'Llegada', tone: 'text-emerald-500' }
    default:
      return { text: `GPS${accuracy ? ` ±${Math.round(accuracy)} m` : ''}`, tone: 'text-emerald-500' }
  }
}

/** Medición en tiempo real: velocidad, distancia recorrida, tiempo de viaje y señal GPS. */
export function LiveTripStats({ live, simulating, accuracy }: { live: TrackerState; simulating: boolean; accuracy: number | null }) {
  const now = useNow(1000)
  const gps = gpsLabel(live, simulating, accuracy)
  const item = 'flex items-center gap-1 whitespace-nowrap'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400" data-testid="live-stats">
      <span className={item} title="Velocidad actual">
        <Gauge className="h-3.5 w-3.5" />
        <span data-testid="live-speed">{live.speedKmh === null ? '— km/h' : `${Math.round(live.speedKmh)} km/h`}</span>
      </span>
      <span className={item} title="Distancia recorrida">
        <Route className="h-3.5 w-3.5" />
        <span data-testid="live-traveled">{formatDistance(live.traveled)}</span>
      </span>
      <span className={item} title="Tiempo de viaje">
        <Timer className="h-3.5 w-3.5" />
        {live.startedAt ? elapsed(now - live.startedAt) : '0:00'}
      </span>
      <span className={`${item} ${gps.tone}`} data-testid="live-gps">
        <Satellite className="h-3.5 w-3.5" />
        {gps.text}
      </span>
    </div>
  )
}
