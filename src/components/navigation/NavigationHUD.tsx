import { ChevronLeft, ChevronRight, LocateFixed, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { navigationState } from '@/features/navigation/navigationProgress'
import { useGeolocation } from '@/hooks/useGeolocation'
import { formatDistance, formatDuration } from '@/utils/distance'
import { useNow } from '@/hooks/useMediaQuery'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { LiveTripStats } from './LiveTripStats'
import { ManeuverIcon } from './ManeuverIcon'

/** Modo navegación: próxima maniobra, distancia al giro, restante y tiempo. */
export function NavigationHUD() {
  const nav = useNavStore((s) => s.navigation)
  const route = useAppStore((s) => s.route)
  const voice = useAppStore((s) => s.navPrefs.voice)
  const live = useNavStore((s) => s.live)
  const accuracy = useNavStore((s) => s.userLocation?.accuracy ?? null)
  const { locate } = useGeolocation()
  const now = useNow(15_000)
  if (!nav.active || !route) return null
  const st = navigationState(route, nav.progress)
  const s = useNavStore.getState
  const target = st.next ?? st.current

  const jump = (dir: 1 | -1) => {
    const ins = route.instructions
    const idx = Math.max(0, Math.min(ins.length - 1, st.nextIndex - 1 + dir))
    s().setNavFlags({ simulating: false, following: true })
    s().setNavProgress(ins[idx].offset + 1)
  }

  const eta = new Date(now + st.remainingTime * 1000)
  return (
    <>
      <div className="pointer-events-auto fixed inset-x-3 top-3 z-[1000] mx-auto max-w-xl animate-slide-up md:top-4" data-testid="nav-hud">
        <div className="flex items-center gap-4 rounded-3xl bg-slate-900/92 p-4 text-white shadow-glass backdrop-blur-xl">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent">
            <ManeuverIcon type={st.arrived ? 'arrive' : target.type} className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            {!st.arrived && st.next && (
              <p className="text-2xl font-bold tabular-nums">{formatDistance(st.distanceToNext)}</p>
            )}
            <p className="truncate text-sm text-slate-200" aria-live="polite">
              {st.arrived ? 'Has llegado a tu destino' : target.text}
            </p>
            {!st.arrived && st.current.street && (
              <p className="truncate text-xs text-slate-400">Por {st.current.street}</p>
            )}
          </div>
        </div>
      </div>
      <div className="pointer-events-auto fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-xl animate-slide-up md:bottom-6">
        {/* En pantallas estrechas: datos en una fila y botones en otra. */}
        <div className="glass-strong flex flex-wrap items-center gap-x-2 gap-y-1 rounded-3xl p-3">
          <div className="flex min-w-0 basis-full items-baseline gap-3 px-1 sm:block sm:flex-1 sm:basis-auto">
            <p className="text-lg font-bold whitespace-nowrap tabular-nums">{formatDuration(st.remainingTime)}</p>
            <p className="text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
              {formatDistance(st.remainingDistance)} · {eta.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="order-last basis-full border-t border-slate-200/60 pt-1.5 dark:border-white/10">
            <LiveTripStats live={live} simulating={nav.simulating} accuracy={accuracy} />
          </div>
          <div className="flex w-full items-center justify-between sm:w-auto sm:justify-end sm:gap-1">
          <IconButton label="Maniobra anterior" onClick={() => jump(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={nav.simulating ? 'Pausar simulación' : 'Simular recorrido'}
            active={nav.simulating}
            onClick={() => s().setNavFlags({ simulating: !nav.simulating, following: true })}
          >
            {nav.simulating ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </IconButton>
          <IconButton label="Maniobra siguiente" onClick={() => jump(1)}>
            <ChevronRight className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Seguir mi ubicación GPS"
            active={nav.following && !nav.simulating}
            onClick={() => {
              s().setNavFlags({ following: true, simulating: false })
              locate({ fly: false, watch: true })
            }}
          >
            <LocateFixed className="h-5 w-5" />
          </IconButton>
          <IconButton label={voice ? 'Silenciar voz' : 'Activar voz'} onClick={() => useAppStore.getState().setNavPrefs({ voice: !voice })}>
            {voice ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </IconButton>
          <IconButton label="Salir de la navegación" onClick={() => s().stopNavigation()} className="text-rose-500">
            <X className="h-5 w-5" />
          </IconButton>
          </div>
        </div>
      </div>
    </>
  )
}
