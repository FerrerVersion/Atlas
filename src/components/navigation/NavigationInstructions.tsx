import { formatDistance } from '@/utils/distance'
import { useAppStore } from '@/store/useAppStore'
import { ManeuverIcon } from './ManeuverIcon'

/** Lista completa de indicaciones generadas desde la geometría de la ruta. */
export function NavigationInstructions() {
  const route = useAppStore((s) => s.route)
  const flyTo = useAppStore((s) => s.flyTo)
  if (!route) return null
  return (
    <section className="space-y-2">
      <h3 className="panel-title">Indicaciones paso a paso</h3>
      <ol className="divide-y divide-slate-200/70 dark:divide-white/5" data-testid="instructions">
        {route.instructions.map((ins, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => flyTo(ins.location[0], ins.location[1], 18)}
              className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-slate-900/3 dark:hover:bg-white/3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900/5 dark:bg-white/8">
                <ManeuverIcon type={ins.type} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{ins.text}</span>
                {ins.distance > 0 && ins.type !== 'depart' && ins.type !== 'continue' && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Luego {formatDistance(ins.distance)}</span>
                )}
              </span>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{formatDistance(ins.offset)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
