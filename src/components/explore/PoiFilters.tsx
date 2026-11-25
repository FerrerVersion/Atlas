import { Chip, Spinner } from '@/components/ui/Controls'
import { DynamicIcon } from '@/components/ui/DynamicIcon'
import { POI_CATEGORIES } from '@/features/poi/poiTypes'
import { useAppStore } from '@/store/useAppStore'

/** Filtros de puntos de interés reales (Overpass). */
export function PoiFilters() {
  const active = useAppStore((s) => s.activeCategories)
  const toggle = useAppStore((s) => s.toggleCategory)
  const status = useAppStore((s) => s.poiStatus)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="panel-title">Puntos de interés</h3>
        {status === 'loading' && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Spinner className="h-3 w-3" /> Consultando OSM…
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {POI_CATEGORIES.map((c) => (
          <Chip key={c.id} active={active.includes(c.id)} onClick={() => toggle(c.id)} color={c.color}>
            <DynamicIcon name={c.icon} className="h-3.5 w-3.5" />
            {c.plural}
          </Chip>
        ))}
      </div>
    </div>
  )
}
